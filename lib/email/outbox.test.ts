import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `email_outbox` in memory, behind the slice of the Supabase query builder
 * the outbox uses: select / update / insert with eq, is, lte, lt, order,
 * limit and maybeSingle. `failUpdate` lets a test make chosen writes fail.
 */
type Row = {
  id: string;
  payload: unknown;
  tag: string | null;
  attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
  last_error: string | null;
};

const db = {
  rows: [] as Row[],
  selects: 0,
  /** Return an error message to fail this update; null lets it through. */
  failUpdate: (patch: Partial<Row>): string | null => (void patch, null),
};

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private patch: Partial<Row> | null = null;
  private max = Infinity;
  private sortBy: keyof Row | null = null;

  select() {
    return this;
  }
  update(patch: Partial<Row>) {
    this.patch = patch;
    return this;
  }
  insert(rows: Partial<Row>[]) {
    for (const r of rows) db.rows.push(row({ id: `row-${db.rows.length + 1}`, ...r }));
    return Promise.resolve({ error: null });
  }
  eq(column: keyof Row, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: keyof Row, value: null) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  lte(column: keyof Row, value: string) {
    this.filters.push((r) => String(r[column]) <= value);
    return this;
  }
  lt(column: keyof Row, value: number) {
    this.filters.push((r) => Number(r[column]) < value);
    return this;
  }
  order(column: keyof Row) {
    this.sortBy = column;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    return this.run().then(({ data, error }) => ({ data: data?.[0] ?? null, error }));
  }
  then<T>(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => T) {
    return this.run().then(resolve);
  }
  private async run() {
    const matching = () => db.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) {
      // First, so a hook can change the table under the write.
      const failure = db.failUpdate(this.patch);
      if (failure) return { data: null, error: { message: failure } };
      const matched = matching();
      for (const r of matched) Object.assign(r, this.patch);
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    db.selects++;
    const matched = matching();
    const sorted = this.sortBy
      ? [...matched].sort((a, b) => String(a[this.sortBy!]).localeCompare(String(b[this.sortBy!])))
      : matched;
    return { data: sorted.slice(0, this.max).map((r) => ({ ...r })), error: null };
  }
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    payload: { to: { email: "ana@example.test" }, subject: "S", html: "H", text: "T" },
    tag: null,
    attempts: 0,
    next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
    sent_at: null,
    last_error: null,
    ...overrides,
  };
}

const sendEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => new Query() }),
}));
vi.mock("./brevo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./brevo")>()),
  hasBrevoEnv: () => true,
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const { backoffMinutes, drainOutbox, MAX_ATTEMPTS, queueEmails } = await import("./outbox");
const { UnconfirmedSendError } = await import("./brevo");

const critical = (code: string) =>
  vi
    .mocked(console.error)
    .mock.calls.some((args) => String(args[0]).startsWith(`CRITICAL {"code":"${code}"`));

beforeEach(() => {
  db.rows = [];
  db.selects = 0;
  db.failUpdate = () => null;
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("backoffMinutes", () => {
  it("doubles from a minute, up to six hours", () => {
    expect([1, 2, 3, 4, 8, 9, 10, 20].map(backoffMinutes)).toEqual([
      1, 2, 4, 8, 128, 256, 360, 360,
    ]);
  });
});

describe("drainOutbox", () => {
  it("sends what is due and marks it sent", async () => {
    db.rows = [row({ id: "a" }), row({ id: "b" })];
    const result = await drainOutbox({ budgetMs: 10_000 });
    expect(result).toEqual({ sent: 2, failed: 0, unconfirmed: 0, finished: true });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(db.rows.every((r) => r.sent_at && r.attempts === 1 && !r.last_error)).toBe(true);
  });

  it("leaves rows not yet due, sent, or out of tries alone", async () => {
    db.rows = [
      row({ id: "later", next_attempt_at: new Date(Date.now() + 60_000).toISOString() }),
      row({ id: "sent", sent_at: new Date().toISOString() }),
      row({ id: "spent", attempts: MAX_ATTEMPTS }),
    ];
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ sent: 0, finished: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records a failure and backs off, without retrying in the same run", async () => {
    db.rows = [row({ id: "a", attempts: 2 })];
    sendEmail.mockRejectedValue(new Error("Brevo answered 503: busy"));
    const before = Date.now();

    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ sent: 0, failed: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [r] = db.rows;
    expect(r.attempts).toBe(3);
    expect(r.sent_at).toBeNull();
    expect(r.last_error).toBe("Brevo answered 503: busy");
    // Try 3 failed: the next is 4 minutes out.
    const wait = Date.parse(r.next_attempt_at) - before;
    expect(wait).toBeGreaterThanOrEqual(4 * 60_000 - 1000);
    expect(wait).toBeLessThan(5 * 60_000);
    expect(critical("EMAIL_GAVE_UP")).toBe(false);
  });

  it("gives up on the last try, loudly", async () => {
    db.rows = [row({ id: "a", attempts: MAX_ATTEMPTS - 1 })];
    sendEmail.mockRejectedValue(new Error("Brevo answered 400: bad address"));
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ failed: 1 });
    expect(db.rows[0].attempts).toBe(MAX_ATTEMPTS);
    expect(critical("EMAIL_GAVE_UP")).toBe(true);
    // Out of tries: a second run does not touch it.
    sendEmail.mockClear();
    await drainOutbox({ budgetMs: 10_000 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not resend an email Brevo may have taken", async () => {
    db.rows = [row({ id: "a" })];
    sendEmail.mockRejectedValue(new UnconfirmedSendError(new Error("timeout")));
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ unconfirmed: 1, failed: 0 });
    const [r] = db.rows;
    expect(r.sent_at).toBeNull();
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(r.last_error).toMatch(/^Unconfirmed/);
    expect(critical("EMAIL_UNCONFIRMED")).toBe(true);

    // Not even once its claim would have run out.
    r.next_attempt_at = new Date(Date.now() - 1).toISOString();
    sendEmail.mockClear();
    await drainOutbox({ budgetMs: 10_000 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips a row another sender claimed first", async () => {
    db.rows = [row({ id: "a" })];
    // Someone else bumps `attempts` between the read and the claim.
    db.failUpdate = (patch) => {
      if (patch.attempts === 1 && db.rows[0].attempts === 0) {
        db.rows[0].attempts = 1;
        db.rows[0].next_attempt_at = new Date(Date.now() + 15 * 60_000).toISOString();
      }
      return null;
    };
    expect(await drainOutbox({ budgetMs: 10_000 })).toEqual({
      sent: 0,
      failed: 0,
      unconfirmed: 0,
      finished: true,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops, rather than spinning, when the claim itself fails", async () => {
    db.rows = [row({ id: "a" }), row({ id: "b" })];
    db.failUpdate = (patch) => ("attempts" in patch ? "connection refused" : null);
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ sent: 0, finished: false });
    expect(sendEmail).not.toHaveBeenCalled();
    // One read: the rows are still due, so another would only read them again.
    expect(db.selects).toBe(1);
  });

  it("retries marking a sent email, and does not send it twice", async () => {
    db.rows = [row({ id: "a" })];
    let failures = 1;
    db.failUpdate = (patch) => ("sent_at" in patch && failures-- > 0 ? "timeout" : null);
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ sent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(db.rows[0].sent_at).not.toBeNull();
    expect(critical("EMAIL_NOT_MARKED_SENT")).toBe(false);
  });

  it("logs an email it could not mark sent at all", async () => {
    db.rows = [row({ id: "a" })];
    db.failUpdate = (patch) => ("sent_at" in patch ? "timeout" : null);
    expect(await drainOutbox({ budgetMs: 10_000 })).toMatchObject({ sent: 1 });
    expect(db.rows[0].sent_at).toBeNull();
    expect(critical("EMAIL_NOT_MARKED_SENT")).toBe(true);
  });
});

describe("queueEmails", () => {
  it("writes the emails, then sends them", async () => {
    await queueEmails([
      { to: { email: "a@example.test" }, subject: "S", html: "H", text: "T", tags: ["event-cancelled"] },
    ]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].tag).toBe("event-cancelled");
    expect(db.rows[0].sent_at).not.toBeNull();
  });
});

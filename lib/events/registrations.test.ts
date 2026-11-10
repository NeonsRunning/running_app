import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `startRegistrationPaymentAction`: what it refuses before anything is
 * written, the PaymentIntent it opens for the amount the database priced, and
 * the guarded save of that PaymentIntent onto the sign-up.
 *
 * Supabase and Stripe are stand-ins. Each query is a chain that records the
 * calls made on it and resolves to whatever `answer` says for its table.
 */

type Call = [method: string, ...args: unknown[]];
type Query = { table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { message: string } | null };

/** Every query made, per client, in order. */
const userQueries: Query[] = [];
const adminQueries: Query[] = [];

let answerUser: (q: Query) => Answer;
let answerAdmin: (q: Query) => Answer;

function client(log: Query[], answer: () => (q: Query) => Answer) {
  return (table: string) => {
    const query: Query = { table, calls: [] };
    log.push(query);
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_, method: string) =>
          method === "then"
            ? (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: null, ...answer()(query) })
            : (...args: unknown[]) => {
                query.calls.push([method, ...args]);
                return chain;
              },
      },
    );
    return chain;
  };
}

const rpc = vi.fn();
const getUser = vi.fn();
const withinLimits = vi.fn();
const settlePayment = vi.fn();
const stripe = {
  paymentIntents: { retrieve: vi.fn(), create: vi.fn(), cancel: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: client(userQueries, () => answerUser),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: client(adminQueries, () => answerAdmin) }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => stripe,
  hasStripeEnv: () => true,
  toCents: (amount: number) => Math.round(amount * 100),
}));
vi.mock("@/lib/rate-limit", () => ({
  LIMITS: { checkoutPerUser: { max: 30, windowSeconds: 3600 } },
  withinLimits,
}));
vi.mock("@/lib/email/review-requested", () => ({
  scheduleReviewRequestedEmail: vi.fn(),
}));
vi.mock("./payments", () => ({ settlePayment }));

const { startRegistrationPaymentAction } = await import("./registrations");
const { WAIVER_VERSION } = await import("@/lib/legal");

const RUNNER = "00000000-0000-4000-8000-000000000003";
const CATEGORY = "00000000-0000-4000-9000-0000000000c1";

const input = {
  categoryId: CATEGORY,
  firstName: "Ana",
  lastName: "Figueroa",
  email: "ana@example.com",
  phone: "787 555 0123",
  dob: "1990-04-02",
  gender: "female",
  emergencyName: "Beto Figueroa",
  emergencyPhone: "787 555 0456",
  club: "",
  shirtSize: null,
  wantsPhotos: false,
  donation: 0,
  shipsByMail: false,
  mailingAddress: "",
  waiverAccepted: true,
  locale: "en",
};

/** The pending sign-up `register_for_event()` hands back. */
const reg = {
  id: "reg-1",
  event_id: "event-1",
  runner_id: RUNNER,
  email: "ana@example.com",
  amount: 50.23,
  payment_intent_id: null as string | null,
};

/** What the action did with a table through one of the clients. */
function made(log: Query[], table: string, method: string): Query[] {
  return log.filter((q) => q.table === table && q.calls.some(([m]) => m === method));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  userQueries.length = 0;
  adminQueries.length = 0;

  getUser.mockResolvedValue({ data: { user: { id: RUNNER } } });
  withinLimits.mockResolvedValue(true);
  rpc.mockResolvedValue({ data: reg, error: null });
  stripe.paymentIntents.create.mockResolvedValue({
    id: "pi_new",
    amount: 5023,
    status: "requires_payment_method",
    client_secret: "secret_new",
  });
  stripe.paymentIntents.cancel.mockResolvedValue({});

  // No sign-up for this race yet.
  answerUser = (q) =>
    q.table === "event_categories"
      ? { data: { event_id: "event-1", event: { account: null } } }
      : { data: null };
  // Every write goes through; the PaymentIntent save finds its row.
  answerAdmin = (q) =>
    q.calls.some(([m]) => m === "select") ? { data: [{ id: "reg-1" }] } : {};
});

describe("startRegistrationPaymentAction", () => {
  it("refuses a sign-up without the waiver, before anything is written", async () => {
    const result = await startRegistrationPaymentAction({
      ...input,
      waiverAccepted: false,
    });

    expect(result).toEqual({ ok: false, error: "waiverRequired" });
    expect(rpc).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("takes only a real `true` for the waiver", async () => {
    const result = await startRegistrationPaymentAction({
      ...input,
      waiverAccepted: "yes" as unknown as boolean,
    });

    expect(result).toEqual({ ok: false, error: "waiverRequired" });
  });

  it("refuses details that are not valid", async () => {
    expect(
      await startRegistrationPaymentAction({ ...input, email: "not-an-address" }),
    ).toEqual({ ok: false, error: "detailsInvalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a signed-out runner", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "sessionExpired",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses once the runner is over the checkout limit", async () => {
    withinLimits.mockResolvedValue(false);

    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "rateLimited",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes on an error the database explains, and hides one it does not", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "soldOut" } });
    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "soldOut",
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: 'duplicate key "registrations_pkey"' },
    });
    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "registrationFailed",
    });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("opens a payment for the amount the database priced, in dollars", async () => {
    const result = await startRegistrationPaymentAction(input);

    expect(result).toEqual({
      ok: true,
      registrationId: "reg-1",
      clientSecret: "secret_new",
      amount: 50.23,
    });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5023,
        currency: "usd",
        metadata: { registration_id: "reg-1", event_id: "event-1", runner_id: RUNNER },
      }),
      { idempotencyKey: "pi-reg-1-5023-none" },
    );
  });

  it("sends the database nothing about price or status", async () => {
    await startRegistrationPaymentAction(input);

    const [, args] = rpc.mock.calls[0];
    expect(Object.keys(args)).toEqual(["p_category_id", "p_details"]);
    expect(args.p_details).not.toHaveProperty("amount");
    expect(args.p_details).not.toHaveProperty("status");
  });

  it("records the waiver on the sign-up, once", async () => {
    await startRegistrationPaymentAction(input);

    const [waiver] = adminQueries.filter((q) =>
      q.calls.some(([m, v]) => m === "update" && "waiver_accepted_at" in (v as object)),
    );
    expect(waiver.table).toBe("registrations");
    expect(waiver.calls).toContainEqual([
      "update",
      { waiver_accepted_at: expect.any(String), waiver_version: WAIVER_VERSION },
    ]);
    expect(waiver.calls).toContainEqual(["eq", "id", "reg-1"]);
    expect(waiver.calls).toContainEqual(["eq", "runner_id", RUNNER]);
    // Kept from the first acceptance: a later call does not move the time.
    expect(waiver.calls).toContainEqual(["is", "waiver_accepted_at", null]);
  });

  it("opens no payment when the waiver could not be recorded", async () => {
    answerAdmin = () => ({ error: { message: "column does not exist" } });

    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "registrationFailed",
    });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("saves the payment only on a sign-up still pending and not under review", async () => {
    await startRegistrationPaymentAction(input);

    const [save] = adminQueries.filter((q) =>
      q.calls.some(([m, v]) => m === "update" && "payment_intent_id" in (v as object)),
    );
    expect(save.calls).toContainEqual(["update", { payment_intent_id: "pi_new" }]);
    expect(save.calls).toContainEqual(["eq", "id", "reg-1"]);
    expect(save.calls).toContainEqual(["eq", "status", "pending"]);
    expect(save.calls).toContainEqual(["is", "payment_submitted_at", null]);
    expect(save.calls).toContainEqual([
      "or",
      "payment_intent_id.eq.pi_new,payment_intent_id.is.null",
    ]);
  });

  // PAY-001: an ATH Móvil payment went in for review in another tab while
  // this call was running. The sign-up must not gain a payable card form.
  it("cancels the payment and says so when the sign-up went under review meanwhile", async () => {
    answerAdmin = (q) =>
      q.calls.some(([m]) => m === "select") ? { data: [] } : {};
    answerUser = (q) => {
      if (q.table === "event_categories") {
        return { data: { event_id: "event-1", event: { account: null } } };
      }
      // The re-read after the save found nothing to save over.
      if (q.calls.some(([m, col]) => m === "eq" && col === "id")) {
        return { data: { status: "pending", payment_submitted_at: "2026-11-10T12:00:00Z" } };
      }
      return { data: null };
    };

    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "paymentUnderReview",
    });
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_new");
  });

  it("reuses the open payment when the amount has not changed", async () => {
    answerUser = (q) =>
      q.table === "event_categories"
        ? { data: { event_id: "event-1", event: { account: null } } }
        : { data: { status: "pending", payment_intent_id: "pi_open" } };
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_open",
      amount: 5023,
      status: "requires_payment_method",
      client_secret: "secret_open",
    });

    const result = await startRegistrationPaymentAction(input);

    expect(result).toMatchObject({ ok: true, clientSecret: "secret_open" });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("cancels a repriced payment and opens one for the new amount", async () => {
    answerUser = (q) =>
      q.table === "event_categories"
        ? { data: { event_id: "event-1", event: { account: null } } }
        : { data: { status: "pending", payment_intent_id: "pi_old" } };
    rpc.mockResolvedValue({ data: { ...reg, payment_intent_id: "pi_old" }, error: null });
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_old",
      amount: 4000,
      status: "requires_payment_method",
      client_secret: "secret_old",
    });

    const result = await startRegistrationPaymentAction(input);

    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_old");
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5023 }),
      // The one on file is part of the key, so the replacement is a new one.
      { idempotencyKey: "pi-reg-1-5023-pi_old" },
    );
    expect(result).toMatchObject({ ok: true, clientSecret: "secret_new" });

    const [save] = made(adminQueries, "registrations", "or");
    expect(save.calls).toContainEqual([
      "or",
      "payment_intent_id.eq.pi_new,payment_intent_id.eq.pi_old",
    ]);
  });

  it("finishes the sign-up when the open payment already went through", async () => {
    answerUser = (q) =>
      q.table === "event_categories"
        ? { data: { event_id: "event-1", event: { account: null } } }
        : { data: { status: "pending", payment_intent_id: "pi_paid" } };
    const paid = { id: "pi_paid", amount: 5023, status: "succeeded" };
    stripe.paymentIntents.retrieve.mockResolvedValue(paid);
    settlePayment.mockResolvedValue({
      ok: true,
      registration: {
        bib: 1001,
        amount: 50.23,
        email: "ana@example.com",
        first_name: "Ana",
        last_name: "Figueroa",
      },
    });

    const result = await startRegistrationPaymentAction(input);

    expect(settlePayment).toHaveBeenCalledWith(paid);
    expect(result).toEqual({
      ok: true,
      confirmed: { bib: 1001, amount: 50.23, email: "ana@example.com", name: "Ana Figueroa" },
    });
    // Not repriced, not charged again.
    expect(rpc).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("reports payments unavailable when Stripe cannot open one", async () => {
    stripe.paymentIntents.create.mockRejectedValue(new Error("Stripe is down"));

    expect(await startRegistrationPaymentAction(input)).toEqual({
      ok: false,
      error: "paymentsUnavailable",
    });
  });
});

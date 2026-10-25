import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/lib/i18n/config";
import type { Email } from "./brevo";

/**
 * Every email, rendered in both languages from sample rows, with nothing
 * left untranslated: a key missing from a dictionary renders as the key
 * itself (`emails.raceReminder.subject`), which no type check catches.
 *
 * The outside world is faked: Supabase answers every query with the sample
 * row for its table, `after()` runs its callback at once, and whatever is
 * handed to Brevo or the outbox is collected instead of sent.
 */

let locale: Locale = "es";

const EVENT = {
  id: "ev-1",
  organizer_id: "user-2",
  name: "Carrera <del Parque>",
  slug: "carrera-del-parque",
  status: "published",
  event_date: "2099-11-07",
  end_date: null,
  last_day: "2099-11-07",
  start_time: "06:30:00",
  anywhere: false,
  venue: "Parque Central",
  address: "Calle 1",
  city: "San Juan",
  region: "Puerto Rico",
  donation_recipient: "Fundación Corre",
};

const CATEGORY = { distance: "10K", start_time: "07:00:00" };

const REGISTRATION = {
  id: "reg-1",
  event_id: EVENT.id,
  category_id: "cat-1",
  runner_id: "user-1",
  email: "ana@example.test",
  first_name: "Ana",
  last_name: "Rivera",
  bib: 42,
  status: "confirmed",
  amount: 35,
  donation: 5,
  shirt_size: "M",
  wants_photos: true,
  ships_by_mail: true,
  mailing_address: "1 Calle Sol\nSan Juan, PR 00901",
  payment_method: "card",
  payment_reference: "ATH-123",
  shipping_tracking: "TRK-1",
  medal_tracking: null,
  medal_mailing_address: "1 Calle Sol\nSan Juan, PR 00901",
  confirmation_email_sent_at: null,
  shipping_email_sent_at: null,
  medal_email_sent_at: null,
  events: EVENT,
  event_categories: CATEGORY,
};

function sample(table: string): Record<string, unknown> {
  switch (table) {
    case "events":
      return EVENT;
    case "event_categories":
      return CATEGORY;
    case "registrations":
      return REGISTRATION;
    case "profiles":
      return { full_name: "Olga Organiza", handle: "olga" };
    case "profile_private":
      return {
        id: "user-1",
        locale,
        email_reminders: true,
        email_results: true,
        email_updates: true,
      };
    case "account_deletion_requests":
      return { requested_at: "2099-10-01T15:00:00Z" };
    default:
      throw new Error(`No sample row for ${table}.`);
  }
}

/** Updates, as [table, patch], so a test can see a claim being given back. */
const updates: [string, Record<string, unknown>][] = [];

function query(table: string) {
  let head = false;
  let empty = false;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["eq", "is", "not", "in", "gte", "lte", "lt", "order", "limit"]) builder[m] = chain;
  Object.assign(builder, {
    select: (_columns?: string, opts?: { head?: boolean }) => {
      if (opts?.head) head = true;
      return builder;
    },
    update: (patch: Record<string, unknown>) => {
      updates.push([table, patch]);
      return builder;
    },
    // A later page (`range` past the first, or `gt` past a cursor) is empty.
    range: (from: number) => {
      if (from > 0) empty = true;
      return builder;
    },
    gt: () => {
      empty = true;
      return builder;
    },
    single: () => Promise.resolve({ data: sample(table), error: null }),
    maybeSingle: () => Promise.resolve({ data: sample(table), error: null }),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(
        head
          ? { data: null, count: 1, error: null }
          : { data: empty ? [] : [sample(table)], error: null },
      ).then(resolve, reject),
  });
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: query,
    auth: {
      admin: {
        getUserById: () => Promise.resolve({ data: { user: { email: "olga@example.test" } } }),
      },
    },
  }),
}));

const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    pending.push(Promise.resolve().then(task));
  },
}));
vi.mock("@/lib/site-url", () => ({ siteOrigin: () => Promise.resolve("https://neons.test") }));
// A compiler placeholder outside a Next build; email picks its locale itself.
vi.mock("next/root-params", () => ({ lang: () => Promise.resolve(undefined) }));

const sent: Email[] = [];
const sendEmail = vi.fn(async (email: Email) => {
  sent.push(email);
});
vi.mock("./brevo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./brevo")>()),
  hasBrevoEnv: () => true,
  sendEmail: (email: Email) => sendEmail(email),
}));
vi.mock("./outbox", () => ({
  queueEmails: async (emails: Email[]) => {
    sent.push(...emails);
  },
}));

const { notifyTeamOfDeletionCancelled, notifyTeamOfDeletionRequest } = await import(
  "./account-deletion"
);
const { scheduleAthMovilRejectedEmail } = await import("./ath-movil-rejected");
const { scheduleEventCancelledEmails } = await import("./event-cancelled");
const { scheduleEventRemovedEmail } = await import("./event-removed");
const { scheduleEventRestoredEmails } = await import("./event-restored");
const { scheduleEventSavedEmails } = await import("./event-updated");
const { scheduleKitShippedEmail } = await import("./kit-shipped");
const { scheduleMedalShippedEmail } = await import("./medal-shipped");
const { schedulePaymentRefundedEmail } = await import("./payment-refunded");
const { sendRaceReminders } = await import("./race-reminder");
const { scheduleRegistrationChangedEmail } = await import("./registration-changed");
const { scheduleRegistrationEmail } = await import("./registration-confirmed");
const { scheduleResultReviewedEmail } = await import("./result-reviewed");
const { scheduleReviewRequestedEmail } = await import("./review-requested");
const { UnconfirmedSendError } = await import("./brevo");

/* eslint-disable @typescript-eslint/no-explicit-any -- sample rows stand in for full table types */
const reg = (overrides: Record<string, unknown> = {}) => ({ ...REGISTRATION, ...overrides }) as any;
const event = (overrides: Record<string, unknown> = {}) => ({ ...EVENT, ...overrides }) as any;
const result = (status: string) =>
  ({
    id: "res-1",
    event_id: EVENT.id,
    registration_id: REGISTRATION.id,
    runner_id: "user-1",
    status,
    finish_seconds: 3125,
    review_note: "La foto no muestra el tiempo.",
    disqualification_reason: "Atajo en el km 4.",
  }) as any;
const intent = {
  id: "pi_1",
  receipt_email: "ana@example.test",
  amount_received: 3500,
  metadata: { event_id: EVENT.id, runner_id: "user-1" },
} as unknown as Stripe.PaymentIntent;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Each email and how to make it send. Locale comes from `locale`. */
const TEMPLATES: [string, () => Promise<unknown>][] = [
  ["account deletion request", () => notifyTeamOfDeletionRequest("user-1")],
  ["account deletion cancelled", () => notifyTeamOfDeletionCancelled("user-1", "2099-10-01T15:00:00Z")],
  ["ATH Móvil rejected", () => scheduleAthMovilRejectedEmail(reg())],
  ["event cancelled", () => scheduleEventCancelledEmails(event())],
  ["event removed", () => scheduleEventRemovedEmail(event(), "Duplicada.")],
  ["event restored and reinstated", () => scheduleEventRestoredEmails(event())],
  [
    "event edited by an admin, and its race day changed",
    () =>
      scheduleEventSavedEmails({
        before: event(),
        saved: event({ event_date: "2099-11-14", last_day: "2099-11-14", venue: "Otro parque" }),
        byAdmin: true,
      }),
  ],
  ["kit shipped", () => scheduleKitShippedEmail(reg())],
  ["kit shipped, no tracking", () => scheduleKitShippedEmail(reg({ shipping_tracking: null }))],
  ["medal shipped", () => scheduleMedalShippedEmail(reg({ medal_tracking: "TRK-2" }))],
  ...(
    ["soldOut", "registrationMissing", "amountMismatch", "paymentUnderReview", "duplicate"] as const
  ).map(
    (reason) =>
      [`payment refunded (${reason})`, () => schedulePaymentRefundedEmail(intent, reason)] as [
        string,
        () => Promise<unknown>,
      ],
  ),
  ["race reminder", () => sendRaceReminders("https://neons.test")],
  ["registration removed", () => scheduleRegistrationChangedEmail(reg(), "removed")],
  ["registration removed, free", () => scheduleRegistrationChangedEmail(reg({ amount: 0 }), "removed")],
  ["registration back to pending", () => scheduleRegistrationChangedEmail(reg(), "pending")],
  ["registration confirmed (card)", () => scheduleRegistrationEmail(reg())],
  ["registration confirmed (ATH Móvil)", () => scheduleRegistrationEmail(reg({ payment_method: "ath_movil" }))],
  ["result accepted", () => scheduleResultReviewedEmail(result("accepted"))],
  ["result rejected", () => scheduleResultReviewedEmail(result("rejected"))],
  ["result disqualified", () => scheduleResultReviewedEmail(result("disqualified"))],
  ["payment to review", () => scheduleReviewRequestedEmail("reg-1", { kind: "payment" })],
  ["result to review", () => scheduleReviewRequestedEmail("reg-1", { kind: "result", finishSeconds: 3125 })],
];

const RAW_KEY = /\b(?:emails|labels|events|common)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*/;

beforeEach(() => {
  sent.length = 0;
  pending.length = 0;
  updates.length = 0;
  sendEmail.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("BREVO_SENDER_EMAIL", "hola@neons.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function render(send: () => Promise<unknown>): Promise<Email[]> {
  await send();
  await Promise.all(pending);
  return [...sent];
}

describe.each(["es", "en"] as const)("every email in %s", (lang) => {
  beforeEach(() => {
    locale = lang;
  });

  it.each(TEMPLATES)("%s", async (_name, send) => {
    const emails = await render(send);
    expect(emails.length).toBeGreaterThan(0);
    // Nothing failed on the way, and no key went untranslated.
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    for (const email of emails) {
      for (const part of [email.subject, email.html, email.text]) {
        expect(part).not.toMatch(RAW_KEY);
        expect(part).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe("optional emails", () => {
  it.each([
    ["race reminder", () => sendRaceReminders("https://neons.test"), "reminders"],
    ["result accepted", () => scheduleResultReviewedEmail(result("accepted")), "results"],
    [
      "race day changed",
      () =>
        scheduleEventSavedEmails({
          before: event(),
          saved: event({ venue: "Otro parque" }),
          byAdmin: false,
        }),
      "updates",
    ],
  ] as const)("%s carries a way out", async (_name, send, preference) => {
    locale = "en";
    const [email] = await render(send);
    expect(email.text).toContain("https://neons.test/en/runners/me/settings");
    expect(email.html).toContain(`href="https://neons.test/en/runners/me/settings"`);
    expect(email.listUnsubscribe?.oneClick).toBe(true);
    expect(new URL(email.listUnsubscribe!.url).searchParams.get("p")).toBe(preference);
  });

  it.each([
    ["registration confirmed", () => scheduleRegistrationEmail(reg())],
    ["event cancelled", () => scheduleEventCancelledEmails(event())],
    ["result disqualified", () => scheduleResultReviewedEmail(result("disqualified"))],
  ])("%s does not: it always goes", async (_name, send) => {
    const emails = await render(send);
    for (const email of emails) {
      expect(email.listUnsubscribe).toBeUndefined();
      expect(email.text).not.toContain("/runners/me/settings");
    }
  });
});

describe("race reminders", () => {
  const released = () =>
    updates.some(([table, patch]) => table === "registrations" && patch.reminder_email_sent_at === null);

  it("give the claim back when Brevo refuses, for the next run", async () => {
    sendEmail.mockRejectedValueOnce(new Error("Brevo answered 503"));
    expect(await sendRaceReminders("https://neons.test")).toMatchObject({ failed: 1 });
    expect(released()).toBe(true);
  });

  it("keep the claim when Brevo did not answer, so nobody is reminded twice", async () => {
    sendEmail.mockRejectedValueOnce(new UnconfirmedSendError(new Error("timeout")));
    expect(await sendRaceReminders("https://neons.test")).toMatchObject({
      failed: 0,
      unconfirmed: 1,
    });
    expect(released()).toBe(false);
  });
});

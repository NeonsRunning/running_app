import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const refundsCreate = vi.fn();
const chargesRetrieve = vi.fn();
const scheduleRefundEmail = vi.fn();
const scheduleConfirmationEmail = vi.fn();

/** Every filter `recordRefund` puts on its update, as [method, ...args]. */
const filters: unknown[][] = [];
const updates: unknown[] = [];
const query = new Proxy({} as Record<string, unknown>, {
  get: (_, method: string) =>
    method === "then"
      ? (resolve: (v: unknown) => void) => resolve({ error: null })
      : (...args: unknown[]) => {
          if (method === "update") updates.push(args[0]);
          else filters.push([method, ...args]);
          return query;
        },
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, from: () => query }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    refunds: { create: refundsCreate },
    charges: { retrieve: chargesRetrieve },
  }),
  hasStripeEnv: () => true,
}));
vi.mock("@/lib/email/payment-refunded", () => ({
  schedulePaymentRefundedEmail: scheduleRefundEmail,
}));
vi.mock("@/lib/email/registration-confirmed", () => ({
  scheduleRegistrationEmail: scheduleConfirmationEmail,
}));

const { recordDispute, recordRefund, settlePayment } = await import("./payments");

function intent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_1",
    status: "succeeded",
    amount_received: 5023,
    metadata: { registration_id: "reg-1" },
    ...overrides,
  } as Stripe.PaymentIntent;
}

function refunded({ replayed = false } = {}) {
  return {
    lastResponse: { headers: replayed ? { "Idempotent-Replayed": "true" } : {} },
  };
}

/** What `confirm_registration_payment()` raises: SQLSTATE P0001, message is the key. */
function raised(key: string) {
  return { data: null, error: { code: "P0001", message: key } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settlePayment", () => {
  it("confirms the registration and schedules the confirmation email", async () => {
    const row = { id: "reg-1", status: "confirmed", payment_intent_id: "pi_1" };
    rpc.mockResolvedValue({ data: row, error: null });

    const result = await settlePayment(intent());

    expect(result).toEqual({ ok: true, registration: row });
    expect(rpc).toHaveBeenCalledWith("confirm_registration_payment", {
      p_registration_id: "reg-1",
      p_payment_intent_id: "pi_1",
      p_amount_cents: 5023,
    });
    expect(scheduleConfirmationEmail).toHaveBeenCalledWith(row);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("refunds a payment that lost its spot, and tells the runner once", async () => {
    rpc.mockResolvedValue(raised("soldOut"));
    refundsCreate.mockResolvedValue(refunded());

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "soldOut" });
    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_1" },
      { idempotencyKey: "refund-pi_1" },
    );
    expect(scheduleRefundEmail).toHaveBeenCalledTimes(1);
  });

  it("does not email again on an idempotent replay of the refund", async () => {
    rpc.mockResolvedValue(raised("amountMismatch"));
    refundsCreate.mockResolvedValue(refunded({ replayed: true }));

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "paymentRefunded" });
    expect(scheduleRefundEmail).not.toHaveBeenCalled();
  });

  // BUG-001: a refund Stripe did not take must not be reported as settled,
  // or the webhook acknowledges it and the money is never returned.
  it("reports a failed refund as a failure, so the webhook retries", async () => {
    rpc.mockResolvedValue(raised("soldOut"));
    refundsCreate.mockRejectedValue(new Error("Stripe is down"));

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "registrationFailed" });
    expect(scheduleRefundEmail).not.toHaveBeenCalled();
  });

  it("treats a charge that was already refunded as refunded", async () => {
    rpc.mockResolvedValue(raised("registrationMissing"));
    refundsCreate.mockRejectedValue(
      Object.assign(new Error("already refunded"), { code: "charge_already_refunded" }),
    );

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "paymentRefunded" });
  });

  it("refunds a duplicate payment but keeps the sign-up it duplicated", async () => {
    const row = { id: "reg-1", status: "confirmed", payment_intent_id: "pi_other" };
    rpc.mockResolvedValue({ data: row, error: null });
    refundsCreate.mockResolvedValue(refunded());

    expect(await settlePayment(intent())).toEqual({
      ok: true,
      registration: row,
      refundFailed: false,
    });
    expect(scheduleConfirmationEmail).not.toHaveBeenCalled();
  });

  it("flags a duplicate whose refund failed, without failing the runner", async () => {
    const row = { id: "reg-1", status: "confirmed", payment_intent_id: "pi_other" };
    rpc.mockResolvedValue({ data: row, error: null });
    refundsCreate.mockRejectedValue(new Error("timeout"));

    const result = await settlePayment(intent());
    expect(result.ok).toBe(true);
    expect(result.ok && result.refundFailed).toBe(true);
  });

  it("leaves a cancelled registration alone when its own payment is reported again", async () => {
    const row = { id: "reg-1", status: "cancelled", payment_intent_id: "pi_1" };
    rpc.mockResolvedValue({ data: row, error: null });

    expect(await settlePayment(intent())).toEqual({
      ok: false,
      error: "registrationCancelled",
    });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(scheduleConfirmationEmail).not.toHaveBeenCalled();
  });

  it("refunds a payment for a registration another payment confirmed and that was cancelled since", async () => {
    const row = { id: "reg-1", status: "cancelled", payment_intent_id: "pi_other" };
    rpc.mockResolvedValue({ data: row, error: null });
    refundsCreate.mockResolvedValue(refunded());

    expect(await settlePayment(intent())).toEqual({
      ok: false,
      error: "registrationCancelledRefunded",
    });
    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_1" },
      { idempotencyKey: "refund-pi_1" },
    );
    expect(scheduleRefundEmail).toHaveBeenCalledWith(expect.anything(), "registrationCancelled");
    expect(scheduleConfirmationEmail).not.toHaveBeenCalled();
  });

  it("reports that refund failing as a failure, so the webhook retries", async () => {
    const row = { id: "reg-1", status: "cancelled", payment_intent_id: null };
    rpc.mockResolvedValue({ data: row, error: null });
    refundsCreate.mockRejectedValue(new Error("timeout"));

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "registrationFailed" });
  });

  it.each([
    ["registrationClosed", "registrationClosed"],
    ["eventUnavailable", "eventUnavailable"],
  ])("refunds a payment that cleared after the race stopped taking sign-ups (%s)", async (key, shown) => {
    rpc.mockResolvedValue(raised(key));
    refundsCreate.mockResolvedValue(refunded());

    expect(await settlePayment(intent())).toEqual({ ok: false, error: shown });
    expect(scheduleRefundEmail).toHaveBeenCalledWith(expect.anything(), "registrationClosed");
  });

  // PAY-001: Stripe keeps a refunded PaymentIntent `succeeded`. One refunded
  // because it could not confirm (sold out, closed) stays on the pending
  // sign-up, and must not confirm it once a spot frees up.
  it("never confirms with a payment that was refunded", async () => {
    chargesRetrieve.mockResolvedValue({ id: "ch_1", amount_refunded: 5023 });

    expect(await settlePayment(intent({ latest_charge: "ch_1" }))).toEqual({
      ok: false,
      error: "paymentRefunded",
    });
    expect(chargesRetrieve).toHaveBeenCalledWith("ch_1");
    expect(rpc).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(scheduleConfirmationEmail).not.toHaveBeenCalled();
  });

  it("reads the refund off an expanded charge without asking Stripe again", async () => {
    const charge = { id: "ch_1", amount_refunded: 100 } as Stripe.Charge;

    expect(await settlePayment(intent({ latest_charge: charge }))).toEqual({
      ok: false,
      error: "paymentRefunded",
    });
    expect(chargesRetrieve).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("confirms with a charge that has no refund on it", async () => {
    const row = { id: "reg-1", status: "confirmed", payment_intent_id: "pi_1" };
    chargesRetrieve.mockResolvedValue({ id: "ch_1", amount_refunded: 0 });
    rpc.mockResolvedValue({ data: row, error: null });

    expect(await settlePayment(intent({ latest_charge: "ch_1" }))).toEqual({
      ok: true,
      registration: row,
    });
  });

  it("asks for a retry when the charge cannot be read", async () => {
    chargesRetrieve.mockRejectedValue(new Error("Stripe is down"));

    expect(await settlePayment(intent({ latest_charge: "ch_1" }))).toEqual({
      ok: false,
      error: "registrationFailed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves the payment alone on a database failure, for a retry to confirm", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection lost" } });

    expect(await settlePayment(intent())).toEqual({ ok: false, error: "registrationFailed" });
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("ignores payments that are not ours or not finished", async () => {
    expect(await settlePayment(intent({ metadata: {} }))).toEqual({
      ok: false,
      error: "registrationFailed",
    });
    expect(await settlePayment(intent({ status: "processing" }))).toEqual({
      ok: false,
      error: "registrationFailed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("recordRefund", () => {
  beforeEach(() => {
    filters.length = 0;
    updates.length = 0;
  });

  // A pending row can still carry a PaymentIntent `settlePayment` refunded,
  // and be confirmed later by ATH Móvil; that refund is not its money.
  it("records a refund only on a registration that payment confirmed by card", async () => {
    const charge = { payment_intent: "pi_1", amount_refunded: 5023 } as Stripe.Charge;

    expect(await recordRefund(charge)).toBe(true);
    expect(updates).toEqual([expect.objectContaining({ amount_refunded: 50.23 })]);
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", "payment_intent_id", "pi_1"],
        ["eq", "payment_method", "stripe"],
        ["in", "status", ["confirmed", "cancelled"]],
      ]),
    );
  });

  it("cancels the sign-up once the payment is refunded in full", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const charge = { payment_intent: "pi_1", amount_refunded: 5023, refunded: true } as Stripe.Charge;

    expect(await recordRefund(charge)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("cancel_unpaid_registration", { p_payment_intent_id: "pi_1" });
  });

  it("keeps the sign-up on a partial refund", async () => {
    const charge = { payment_intent: "pi_1", amount_refunded: 800, refunded: false } as Stripe.Charge;

    expect(await recordRefund(charge)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks for a retry when the cancellation fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    const charge = { payment_intent: "pi_1", amount_refunded: 5023, refunded: true } as Stripe.Charge;

    expect(await recordRefund(charge)).toBe(false);
  });
});

describe("recordDispute", () => {
  beforeEach(() => {
    filters.length = 0;
    updates.length = 0;
  });

  function dispute(status: Stripe.Dispute.Status): Stripe.Dispute {
    return { payment_intent: "pi_1", amount: 5023, status, created: 1_800_000_000 } as Stripe.Dispute;
  }

  it("records a dispute on the sign-up that card payment confirmed, and leaves it", async () => {
    expect(await recordDispute(dispute("needs_response"))).toBe(true);
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", "payment_intent_id", "pi_1"],
        ["eq", "payment_method", "stripe"],
      ]),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancels the sign-up once the dispute is lost and the money gone", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    expect(await recordDispute(dispute("lost"))).toBe(true);
    expect(rpc).toHaveBeenCalledWith("cancel_unpaid_registration", { p_payment_intent_id: "pi_1" });
  });
});

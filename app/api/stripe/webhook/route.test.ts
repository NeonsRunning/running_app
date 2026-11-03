import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook route: nothing is processed without Stripe's signature, and
 * every failure Stripe should retry answers with an error status.
 */

const constructEvent = vi.fn();
const settlePayment = vi.fn();
const recordRefund = vi.fn();
const recordDispute = vi.fn();
const revalidatePath = vi.fn();
let stripeReady = true;

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ webhooks: { constructEvent } }),
  hasStripeEnv: () => stripeReady,
}));
vi.mock("@/lib/events/payments", () => ({ settlePayment, recordRefund, recordDispute }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { POST } = await import("./route");

function delivery(body = '{"id":"evt_1"}', signature = "t=1,v1=abc"): Request {
  return new Request("https://neons.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

/** Stripe's event as `constructEvent` hands it back once the signature checks out. */
function event(type: string, object: Record<string, unknown>) {
  constructEvent.mockReturnValue({ type, data: { object } });
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeReady = true;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("the signature", () => {
  it("refuses everything while the endpoint has no signing secret", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect((await POST(delivery())).status).toBe(503);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("refuses a delivery whose signature does not check out", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    expect((await POST(delivery())).status).toBe(400);
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("checks the exact bytes Stripe sent, against the header and the secret", async () => {
    event("customer.created", {});
    const body = '{"id":"evt_1",  "spacing":"kept"}';

    await POST(delivery(body, "t=1,v1=sig"));
    expect(constructEvent).toHaveBeenCalledWith(body, "t=1,v1=sig", "whsec_test");
  });
});

describe("payment_intent.succeeded", () => {
  it("leaves a payment that is not ours alone", async () => {
    event("payment_intent.succeeded", { id: "pi_1", metadata: {} });

    expect((await POST(delivery())).status).toBe(200);
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("settles one of ours and refreshes the pages that show spots left", async () => {
    event("payment_intent.succeeded", { id: "pi_1", metadata: { registration_id: "reg-1" } });
    settlePayment.mockResolvedValue({ ok: true, registration: {} });

    expect((await POST(delivery())).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("asks Stripe to retry when the payment could not be settled", async () => {
    event("payment_intent.succeeded", { id: "pi_1", metadata: { registration_id: "reg-1" } });
    settlePayment.mockResolvedValue({ ok: false, error: "registrationFailed" });

    expect((await POST(delivery())).status).toBe(500);
  });

  it("asks Stripe to retry when a duplicate payment's refund failed", async () => {
    event("payment_intent.succeeded", { id: "pi_1", metadata: { registration_id: "reg-1" } });
    settlePayment.mockResolvedValue({ ok: true, registration: {}, refundFailed: true });

    expect((await POST(delivery())).status).toBe(500);
  });

  it("acknowledges a payment refunded because it could not confirm", async () => {
    event("payment_intent.succeeded", { id: "pi_1", metadata: { registration_id: "reg-1" } });
    settlePayment.mockResolvedValue({ ok: false, error: "soldOut" });

    expect((await POST(delivery())).status).toBe(200);
  });
});

describe("refunds and disputes", () => {
  it("records a refund, and asks for a retry when it could not", async () => {
    event("charge.refunded", { id: "ch_1" });
    recordRefund.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect((await POST(delivery())).status).toBe(200);
    expect((await POST(delivery())).status).toBe(500);
  });

  it.each(["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"])(
    "records %s",
    async (type) => {
      event(type, { id: "dp_1" });
      recordDispute.mockResolvedValue(true);

      expect((await POST(delivery())).status).toBe(200);
      expect(recordDispute).toHaveBeenCalledWith({ id: "dp_1" });
    },
  );

  it("asks for a retry when a dispute could not be recorded", async () => {
    event("charge.dispute.closed", { id: "dp_1" });
    recordDispute.mockResolvedValue(false);

    expect((await POST(delivery())).status).toBe(500);
  });
});

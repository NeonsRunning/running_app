import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { paymentState } = await import("./admin-queries");

const base = {
  status: "confirmed" as const,
  amount: 35.68,
  amount_refunded: 0,
  dispute_status: null,
};

describe("paymentState", () => {
  it("is paid when nothing has happened since", () => {
    expect(paymentState(base)).toBe("paid");
  });

  it("tells a partial refund from a full one", () => {
    expect(paymentState({ ...base, amount_refunded: 5 })).toBe("partiallyRefunded");
    expect(paymentState({ ...base, amount_refunded: 35.68 })).toBe("refunded");
  });

  it("shows a cancelled sign-up whose money was kept as cancelled", () => {
    expect(paymentState({ ...base, status: "cancelled" })).toBe("cancelled");
  });

  it("puts an open or lost dispute first, and lets a won one go", () => {
    expect(paymentState({ ...base, dispute_status: "needs_response" })).toBe("disputed");
    expect(paymentState({ ...base, dispute_status: "lost", amount_refunded: 0 })).toBe("disputed");
    expect(paymentState({ ...base, dispute_status: "won" })).toBe("paid");
  });
});

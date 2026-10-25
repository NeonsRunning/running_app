import { describe, expect, it } from "vitest";
import { checkInKit, reconcileTaps, type CheckInTap } from "./check-in-station";

describe("checkInKit", () => {
  it("is at the tent unless the runner chose the mail", () => {
    expect(checkInKit(false, null)).toBe("tent");
  });

  it("is mailed only once it shipped", () => {
    expect(checkInKit(true, "2026-11-01T12:00:00Z")).toBe("mailed");
    expect(checkInKit(true, null)).toBe("notShipped");
  });
});

describe("reconcileTaps", () => {
  const AT = "2026-11-01T07:00:00Z";
  const taps = (entries: [string, CheckInTap][]) => new Map(entries);

  it("drops a tap the list has caught up with", () => {
    const next = reconcileTaps(
      taps([["a", { checkedInAt: AT, saved: true }]]),
      [{ id: "a", checkedInAt: AT }],
      false,
    );
    expect(next.size).toBe(0);
  });

  it("keeps an undo over a late refresh from the check-in before it", () => {
    // Check in, then undo; the check-in's refresh lands before the undo's.
    const pending = taps([["a", { checkedInAt: null, saved: false }]]);
    const next = reconcileTaps(pending, [{ id: "a", checkedInAt: AT }], false);
    expect(next.get("a")).toEqual({ checkedInAt: null, saved: false });
    // Even with nothing in flight, a save not yet back keeps its tap.
    expect(reconcileTaps(pending, [{ id: "a", checkedInAt: AT }], true).size).toBe(1);
  });

  it("keeps a saved tap while another save or refresh is in flight", () => {
    const pending = taps([["a", { checkedInAt: null, saved: true }]]);
    expect(reconcileTaps(pending, [{ id: "a", checkedInAt: AT }], false).size).toBe(1);
  });

  it("lets a settled list win over a saved tap", () => {
    // Another phone checked the runner in again after this one's undo.
    const pending = taps([["a", { checkedInAt: null, saved: true }]]);
    expect(reconcileTaps(pending, [{ id: "a", checkedInAt: AT }], true).size).toBe(0);
  });

  it("drops a tap on a runner no longer listed", () => {
    const pending = taps([["a", { checkedInAt: AT, saved: false }]]);
    expect(reconcileTaps(pending, [], false).size).toBe(0);
  });

  it("returns the same map when nothing changes", () => {
    const pending = taps([["a", { checkedInAt: AT, saved: false }]]);
    expect(reconcileTaps(pending, [{ id: "a", checkedInAt: null }], false)).toBe(pending);
  });
});

/**
 * The check-in station's plain logic, apart from the component so it can be
 * tested: where a runner's kit is, and which optimistic taps a refreshed
 * list has caught up with.
 */

/**
 * The fragment of the event page's ATH Móvil review panel, where the station
 * sends a volunteer whose runner's payment is still under review.
 */
export const PAYMENT_REVIEW_ANCHOR = "payment-review";

/**
 * Where a runner's race kit is, as the check-in station tells the volunteer:
 * picked up at the tent, already mailed (nothing to hand over), or asked for
 * by mail but never shipped — hand it over at the tent after all.
 */
export type CheckInKit = "tent" | "mailed" | "notShipped";

/** Where the kit is, from what the sign-up chose and what was shipped. */
export function checkInKit(shipsByMail: boolean, shippedAt: string | null): CheckInKit {
  if (!shipsByMail) return "tent";
  return shippedAt ? "mailed" : "notShipped";
}

/**
 * A tap shown before the server has it: the check-in time it set (null for
 * an undo), and whether the save has come back.
 */
export type CheckInTap = { checkedInAt: string | null; saved: boolean };

/**
 * The taps still to show over a fresh list of `rows`.
 *
 * A tap goes once the list agrees with it. One the list disagrees with stays
 * while anything is in flight: that list may have been read before the tap
 * was saved — an earlier tap's refresh landing late — and dropping the tap
 * would flip the screen back. Once its save is back and no save or refresh
 * is in flight (`settled`), the list is newer than the tap, so it wins: say,
 * another phone undid the check-in since.
 */
export function reconcileTaps(
  taps: ReadonlyMap<string, CheckInTap>,
  rows: readonly { id: string; checkedInAt: string | null }[],
  settled: boolean,
): ReadonlyMap<string, CheckInTap> {
  if (taps.size === 0) return taps;
  const server = new Map(rows.map((r) => [r.id, r.checkedInAt !== null]));
  const next = new Map<string, CheckInTap>();
  for (const [id, tap] of taps) {
    const agrees = server.get(id) === (tap.checkedInAt !== null);
    if (agrees || !server.has(id) || (tap.saved && settled)) continue;
    next.set(id, tap);
  }
  return next.size === taps.size ? taps : next;
}

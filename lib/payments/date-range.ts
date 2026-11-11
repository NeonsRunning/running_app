import { addDays, isIsoDate } from "@/lib/dates";

/**
 * The date range on `/admin/payments/history`, in island dates. Plain
 * functions, so they can be tested without a server.
 */

export type DateRange = { from: string | null; to: string | null };

export type RangePreset = "last7" | "last30" | "thisMonth" | "lastMonth" | "thisYear";
export const RANGE_PRESETS: readonly RangePreset[] = [
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisYear",
];

/**
 * The range in the URL. A malformed date is dropped rather than refused, and
 * a range typed backwards is turned around: both ends are meant, just in the
 * wrong boxes.
 */
export function parseDateRange(from: unknown, to: unknown): DateRange {
  const f = typeof from === "string" && isIsoDate(from) ? from : null;
  const t = typeof to === "string" && isIsoDate(to) ? to : null;
  if (f && t && f > t) return { from: t, to: f };
  return { from: f, to: t };
}

/** The dates a preset covers, counting `today` (an island date) in. */
export function presetRange(preset: RangePreset, today: string): DateRange {
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  switch (preset) {
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: `${month}-01`, to: today };
    case "lastMonth": {
      const lastDay = addDays(`${month}-01`, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case "thisYear":
      return { from: `${year}-01-01`, to: today };
  }
}

/** Which preset a range is exactly, so its button can show as selected. */
export function matchingPreset(range: DateRange, today: string): RangePreset | null {
  return (
    RANGE_PRESETS.find((p) => {
      const r = presetRange(p, today);
      return r.from === range.from && r.to === range.to;
    }) ?? null
  );
}

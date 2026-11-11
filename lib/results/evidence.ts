/**
 * Finish evidence: the screenshot a runner sends to claim a race result.
 *
 * The same route as event images (`lib/events/images.ts`): the browser
 * converts the screenshot to WebP and uploads it straight into the runner's
 * folder of the `race-evidence` bucket, then hands only the object path and
 * the finish time to the server action. The bucket is private — the runner
 * and the event's organizer read it through signed URLs.
 * Shared by client and server, so nothing here may import server code.
 */

export const EVIDENCE_BUCKET = "race-evidence";

/** Mirrors the bucket's `file_size_limit`, which applies after conversion. */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

/** Phone screenshots are tall; this keeps the stats in them legible. */
export const EVIDENCE_MAX_EDGE = 2400;

/** Longest note an organizer can leave on a rejection. */
export const REVIEW_NOTE_MAX = 300;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/${UUID}\\.webp$`, "i");

/** Whether `path` is an evidence file inside `runnerId`'s folder. */
export function isOwnEvidencePath(path: string, runnerId: string): boolean {
  const match = PATH.exec(path);
  return Boolean(match && match[1].toLowerCase() === runnerId.toLowerCase());
}

/** Under 7 days, as `race_results` checks: a multi-day ultra still fits. */
const MAX_SECONDS = 7 * 24 * 3600;

/** h:mm:ss or mm:ss with colons, spaces allowed around them, optional fraction. */
const COLON_TIME = /^(?:(\d{1,3})\s*:\s*)?([0-5]?\d)\s*:\s*([0-5]\d)(?:[.,](\d+))?$/;
/** The same with `.`, `;` or a space between the parts (no fraction then). */
const OTHER_SEP_TIME = /^(?:(\d{1,3})\s*[.;\s]\s*)?([0-5]?\d)\s*[.;\s]\s*([0-5]\d)$/;
/** Digits only, read from the right: ss, mm, then up to three of h. */
const DIGITS_TIME = /^(\d{0,3}?)(\d{1,2})(\d{2})$/;

/**
 * A finish time as typed. Seconds, or null if it does not read as a time.
 *
 * - "25:41" (mm:ss) or "1:02:33" (h:mm:ss), the form the hint asks for;
 * - other separators — "1.02.33", "1;02;33", "1 02 33" — and full-width
 *   colons from some keyboards;
 * - digits only, which is all a phone's number keypad can type:
 *   "2541" is 25:41 and "12541" is 1:25:41;
 * - a fraction of a second, as chip results show: "25:41.3" counts as 25:42,
 *   rounded up the way road race times are.
 */
export function parseFinishTime(value: string): number | null {
  // NFKC folds full-width digits and colons ("１：０２") into ASCII.
  const text = value.normalize("NFKC").trim();
  const match = text.includes(":")
    ? COLON_TIME.exec(text)
    : (OTHER_SEP_TIME.exec(text) ?? DIGITS_TIME.exec(text));
  if (!match) return null;
  const [, h, m, s, fraction] = match;
  if (Number(m) > 59 || Number(s) > 59) return null;
  const roundUp = fraction && /[1-9]/.test(fraction) ? 1 : 0;
  const seconds = Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + roundUp;
  return seconds > 0 && seconds < MAX_SECONDS ? seconds : null;
}

/** 1541 → "25:41"; 3753 → "1:02:33". */
export function formatFinishTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Minutes per km, in the fixtures' "4:55 / km" form. */
export function formatPace(seconds: number, km: number): string {
  if (!(km > 0)) return "—";
  const perKm = Math.round(seconds / km);
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, "0")} / km`;
}

/** The longest distance a runner can give, as `race_results` checks. */
const MAX_DISTANCE_KM = 500;

/**
 * The distance a runner's app recorded, as typed: "10.01", "10,01" (a comma
 * for the decimal, as Spanish keyboards type it) or "10.01 km". In km,
 * rounded to hundredths, or null if it does not read as one. A blank field
 * is for the caller to tell apart: it means the runner gave none.
 */
export function parseDistanceRun(value: string): number | null {
  const text = value.normalize("NFKC").trim().replace(/\s*km$/i, "").replace(",", ".");
  if (!/^\d{1,3}(?:\.\d+)?$/.test(text)) return null;
  const km = Math.round(Number(text) * 100) / 100;
  return km > 0 && km <= MAX_DISTANCE_KM ? km : null;
}

/**
 * The pace a result shows: over the distance the runner's app recorded if
 * they gave it, else over the category's. A virtual 5K run as a 10K reads
 * at the pace the runner actually ran.
 */
export function resultPace(
  seconds: number,
  categoryKm: number,
  distanceRunKm: number | null,
): string {
  return formatPace(seconds, distanceRunKm ?? categoryKm);
}

/**
 * Today on the island, ISO. Results open on the race's first day there,
 * which is what `submit_race_result()` checks too.
 */
export { puertoRicoToday } from "@/lib/dates";

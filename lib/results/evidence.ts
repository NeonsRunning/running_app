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

/**
 * A finish time as typed: "25:41" (mm:ss) or "1:02:33" (h:mm:ss). Seconds,
 * or null if it does not read as a time.
 */
export function parseFinishTime(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  const seconds = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
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

/**
 * Today on the island, ISO. Results open on the race's first day there,
 * which is what `submit_race_result()` checks too.
 */
export { puertoRicoToday } from "@/lib/dates";

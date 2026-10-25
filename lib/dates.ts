/**
 * Calendar dates on the island.
 *
 * Every race is dated in Puerto Rico (UTC-4, no daylight saving), and so is
 * every "today" the app compares against: whether registration is open,
 * whether a race is still listed, whether it has finished. Servers run in
 * UTC, where the date turns over at 20:00 island time, so reading "today"
 * off a UTC clock closes registration four hours early and drops a race from
 * the listing on the evening it is run.
 *
 * The database does the same with `(now() at time zone 'America/Puerto_Rico')::date`.
 *
 * Plain functions with no server imports: client components use them too.
 */

export const TIME_ZONE = "America/Puerto_Rico";

const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** Today on the island, as YYYY-MM-DD. */
export function puertoRicoToday(now: Date = new Date()): string {
  return ISO_DAY.format(now);
}

/** The island's calendar date of an instant (a timestamptz), as YYYY-MM-DD. */
export function puertoRicoDate(instant: string | Date): string {
  return ISO_DAY.format(typeof instant === "string" ? new Date(instant) : instant);
}

/** A YYYY-MM-DD date moved by whole days. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from one YYYY-MM-DD date to another; negative if earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

/**
 * Whether a string is a real YYYY-MM-DD calendar date. `Date.parse` rolls
 * "2026-02-31" over to 3 March rather than refusing it, and Postgres would
 * then refuse the save, so the date must come back out exactly as it went in.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The instant an island date begins. Puerto Rico keeps UTC-4 all year, so
 * this is midnight there: 04:00 UTC.
 */
export function puertoRicoMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00-04:00`);
}

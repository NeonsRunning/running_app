import { puertoRicoToday } from "@/lib/dates";
import type { RegistrationStatus } from "@/lib/types";

/**
 * Where a published race's sign-ups stand, from its dates and the paid
 * runners `registration_counts()` reports.
 *
 * "full" once they reach the event's cap, or every category's: then
 * `register_for_event()` refuses anyone. It also counts live checkout holds,
 * which only it can see, so a race can still turn a runner away as sold out
 * while this says "almost-full". `search_events()` mirrors these rules.
 *
 * Plain function, no server imports: tested on its own.
 */
export function registrationStatus(
  dates: { registration_closes: string; registration_opens: string | null },
  /** Paid runners across the event. */
  registered: number,
  /** The event's cap, else the sum of its categories'. */
  capacity: number,
  categories: { registered: number; capacity: number }[],
  today: string = puertoRicoToday(),
): RegistrationStatus {
  if (today > dates.registration_closes) return "closed";
  if (dates.registration_opens && today < dates.registration_opens)
    return "opening-soon";
  if (
    (capacity > 0 && registered >= capacity) ||
    (categories.length > 0 && categories.every((c) => c.registered >= c.capacity))
  )
    return "full";
  if (capacity > 0 && registered / capacity >= 0.9) return "almost-full";
  return "open";
}

/** Spots still open, never below zero: a cap can be lowered under the field. */
export function spotsLeft(capacity: number, registered: number): number {
  return Math.max(0, capacity - registered);
}

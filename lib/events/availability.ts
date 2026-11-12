import { daysBetween, puertoRicoToday } from "@/lib/dates";
import type { RegistrationStatus } from "@/lib/types";

/**
 * Where a published race's sign-ups stand, from its dates and the paid
 * runners `registration_counts()` reports.
 *
 * "full" when the organizer marked it sold out, whatever the rest says, or
 * once they reach the event's cap, or every category's: then
 * `register_for_event()` refuses anyone. It also counts live checkout holds,
 * which only it can see, so a race can still turn a runner away as sold out
 * while this says "almost-full". Never "almost-full" while the organizer
 * hides the spots left: that would give away how full the race is.
 * `search_events()` mirrors these rules.
 *
 * Plain function, no server imports: tested on its own.
 */
export function registrationStatus(
  dates: {
    registration_closes: string;
    registration_opens: string | null;
    sold_out?: boolean;
    show_spots_left?: boolean;
  },
  /** Paid runners across the event. */
  registered: number,
  /** The event's cap, else the sum of its categories'. */
  capacity: number,
  categories: { registered: number; capacity: number }[],
  today: string = puertoRicoToday(),
): RegistrationStatus {
  if (dates.sold_out) return "full";
  if (today > dates.registration_closes) return "closed";
  if (dates.registration_opens && today < dates.registration_opens)
    return "opening-soon";
  if (
    (capacity > 0 && registered >= capacity) ||
    (categories.length > 0 && categories.every((c) => c.registered >= c.capacity))
  )
    return "full";
  if (
    dates.show_spots_left !== false &&
    capacity > 0 &&
    registered / capacity >= 0.9
  )
    return "almost-full";
  return "open";
}

/** Spots still open, never below zero: a cap can be lowered under the field. */
export function spotsLeft(capacity: number, registered: number): number {
  return Math.max(0, capacity - registered);
}

/** How long a race wears the "New event" badge after it was created. */
export const NEW_EVENT_DAYS = 14;

/** Created within the last `NEW_EVENT_DAYS` days. */
export function isNewEvent(
  createdAt: string,
  now: number = Date.now(),
): boolean {
  const age = now - Date.parse(createdAt);
  return age >= 0 && age < NEW_EVENT_DAYS * 24 * 60 * 60 * 1000;
}

/** How long before its end a race wears the "Ending soon" badge. */
export const ENDING_SOON_DAYS = 14;

/**
 * Ending soon: sign-ups still open close within `ENDING_SOON_DAYS` days, or
 * a multi-day event already under way reaches its last day within them.
 * Days count on the island, the last one included.
 */
export function isEndingSoon(
  event: {
    event_date: string;
    end_date: string | null;
    registration_closes: string;
  },
  status: RegistrationStatus,
  today: string = puertoRicoToday(),
): boolean {
  const soon = (date: string) => {
    const left = daysBetween(today, date);
    return left >= 0 && left < ENDING_SOON_DAYS;
  };
  const signUpsClosing =
    (status === "open" || status === "almost-full") &&
    soon(event.registration_closes);
  const underway =
    event.end_date !== null &&
    event.end_date > event.event_date &&
    event.event_date <= today;
  return signUpsClosing || (underway && soon(event.end_date!));
}

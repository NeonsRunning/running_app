import { getEventBySlug, getOrganizer } from "@/lib/data";
import { LOCALE_TAGS, type Locale } from "@/lib/i18n/config";
import { formatMonthShort, formatWeekdayShort } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import { initialsOf } from "@/lib/profile/queries";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  AidStation,
  Organizer,
  RegistrationStatus,
  RunningEvent,
  ScheduleItem,
} from "@/lib/types";

/**
 * Reading events.
 *
 * Published races live in two places for now: the fixtures in `lib/data.ts`
 * and the `events` table organizers write to from /publish. This module is
 * the seam that joins them — rows are mapped into the same `RunningEvent`
 * shape the fixtures use, so every card, filter and detail tab renders a
 * database race without knowing where it came from.
 *
 * Fixtures win a slug collision; the publish action never hands one out.
 */

const EVENT_COLUMNS = `
  *,
  event_categories (*),
  organizer:profiles!events_organizer_id_fkey (id, full_name, bio, created_at)
`;

type EventRow = Tables<"events"> & {
  event_categories: Tables<"event_categories">[];
  organizer: Pick<
    Tables<"profiles">,
    "id" | "full_name" | "bio" | "created_at"
  > | null;
};

/**
 * A published row. Drafts may leave these empty; the
 * `events_published_complete` check guarantees a published row does not.
 */
type PublishedRow = EventRow & {
  [K in "type" | "event_date" | "start_time" | "registration_closes" | "venue" | "city"]: NonNullable<EventRow[K]>;
};

function isPublished(row: EventRow): row is PublishedRow {
  return (
    row.status === "published" &&
    row.type !== null &&
    row.event_date !== null &&
    row.start_time !== null &&
    row.registration_closes !== null &&
    row.venue !== null &&
    row.city !== null
  );
}

/** Category id to runners signed up. */
type Counts = Map<string, number>;

/** "18:30:00" → "6:30 PM", the clock format the fixtures and `formatClock` use. */
export function clock(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function registrationStatus(
  row: PublishedRow,
  registered: number,
  capacity: number,
): RegistrationStatus {
  const today = todayIso();
  if (today > row.registration_closes) return "closed";
  if (row.registration_opens && today < row.registration_opens)
    return "opening-soon";
  if (capacity > 0 && registered / capacity >= 0.9) return "almost-full";
  return "open";
}

function toEvent(
  row: PublishedRow,
  counts: Counts,
  locale: Locale,
  t: Translate,
): RunningEvent {
  const categories = [...row.event_categories]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      name: c.distance,
      distanceKm: Number(c.distance_km),
      price: Number(c.price),
      startTime: clock(c.start_time),
      wave: "Open",
      capacity: c.capacity,
      registered: counts.get(c.id) ?? 0,
    }));

  const capacity =
    row.capacity ?? categories.reduce((sum, c) => sum + c.capacity, 0);
  const registered = categories.reduce((sum, c) => sum + c.registered, 0);
  const status = registrationStatus(row, registered, capacity);
  const [year, , day] = row.event_date.split("-");
  const description = row.description
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const aidStations = (row.aid_stations as Omit<AidStation, "label">[]).map(
    (a, i) => ({
      ...a,
      label: t("events.tabs.aidStationLabel", { n: i + 1 }),
    }),
  );

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    // The first paragraph doubles as the card's one-liner.
    tagline: description[0] ?? "",
    description,
    type: row.type,
    city: row.city,
    region: row.region,
    venue: row.venue,
    address: [row.address, row.city, row.postal_code]
      .filter(Boolean)
      .join(", "),
    date: row.event_date,
    dow: formatWeekdayShort(row.event_date, locale),
    day,
    month: formatMonthShort(row.event_date, locale),
    year,
    startTime: clock(row.start_time),
    registrationCloses: new Date(
      `${row.registration_closes}T12:00:00`,
    ).toLocaleDateString(LOCALE_TAGS[locale], {
      month: "long",
      day: "numeric",
    }),
    registrationOpens: row.registration_opens
      ? new Date(`${row.registration_opens}T12:00:00`).toLocaleDateString(
          LOCALE_TAGS[locale],
          { month: "long", day: "numeric" },
        )
      : undefined,
    registrationStatus: status,
    statusLabel: t(`labels.status.${status}`),
    difficulty: row.difficulty,
    terrain: row.terrain,
    surface: row.terrain,
    elevationGain: row.elevation_gain,
    cutoff: row.cutoff,
    minimumAge: row.minimum_age,
    categories,
    featuredDistance: categories[0]?.name ?? "5K",
    fromPrice: categories.length
      ? Math.min(...categories.map((c) => c.price))
      : 0,
    registered,
    capacity,
    organizerId: row.organizer_id,
    // Nothing in the wizard describes the race kit yet.
    included: [],
    schedule: row.schedule as ScheduleItem[],
    aidStations,
    parking: row.parking,
    directions: row.directions,
    popularity: registered,
    bookable: true,
    shirtSizes: row.shirt_sizes,
    extras: {
      shirtPrice:
        row.offers_shirt && row.shirt_sizes.length ? Number(row.shirt_price) : null,
      photoPrice: row.offers_photos ? Number(row.photo_price) : null,
      donationRecipient:
        row.accepts_donations && row.donation_recipient
          ? row.donation_recipient
          : null,
    },
  };
}

/**
 * The organizer card for a database event, built from the public profile.
 * A private profile reads as null under row-level security, so the race
 * still renders, credited to its name only.
 */
function toOrganizer(row: PublishedRow): Organizer {
  const name = row.organizer?.full_name ?? "NEONS RUNNING";
  return {
    id: row.organizer_id,
    name,
    initials: initialsOf(name),
    verified: false,
    since: new Date(row.organizer?.created_at ?? row.created_at).getFullYear(),
    eventsHosted: 0,
    finishers: 0,
    rating: 0,
    website: "",
    instagram: "",
    email: "",
    blurb: row.organizer?.bio ?? "",
  };
}

/**
 * Rows, or nothing. A database hiccup should cost the listing its new races,
 * not the whole page.
 */
async function selectEvents(where: {
  slug?: string;
  from?: string;
}): Promise<PublishedRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  // Explicit, though the policy already hides other people's drafts: an
  // organizer's own drafts must not show up in the public listing either.
  let query = supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published");
  if (where.slug) query = query.eq("slug", where.slug);
  if (where.from) query = query.gte("event_date", where.from);

  const { data, error } = await query.order("event_date");
  return error || !data ? [] : (data as unknown as EventRow[]).filter(isPublished);
}

/**
 * How many runners are in each category of these events. Counts only: the
 * registrations themselves are private to runner and organizer.
 */
export async function registrationCounts(eventIds: string[]): Promise<Counts> {
  if (!hasSupabaseEnv() || eventIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.rpc("registration_counts", {
    p_event_ids: eventIds,
  });
  return new Map((data ?? []).map((r) => [r.category_id, Number(r.registered)]));
}

export type PlatformStats = {
  races: number;
  runners: number;
  organizers: number;
  clubs: number;
};

/**
 * The landing page's headline totals, from `platform_stats()`. Zeros when
 * there is no database to ask or the call fails; never fixture figures.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const empty = { races: 0, runners: 0, organizers: 0, clubs: 0 };
  if (!hasSupabaseEnv()) return empty;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_stats");
  // Most often the migration has not been pushed; say so rather than show
  // zeros that look like real figures.
  if (error) console.error("platform_stats() failed:", error.message);
  const row = data?.[0];
  return row
    ? {
        races: Number(row.races),
        runners: Number(row.runners),
        organizers: Number(row.organizers),
        clubs: Number(row.clubs),
      }
    : empty;
}

/** The caller's own sign-up for an event, if they have one. */
export async function getOwnRegistration(
  runnerId: string,
  eventId: string,
): Promise<{ categoryId: string; bib: number; amount: number; email: string } | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("category_id, bib, amount, email")
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .maybeSingle();

  return data
    ? {
        categoryId: data.category_id,
        bib: data.bib,
        amount: Number(data.amount),
        email: data.email,
      }
    : null;
}

/** Upcoming races organizers published, soonest first. No fixtures. */
export async function listPublishedEvents(
  locale: Locale,
): Promise<RunningEvent[]> {
  const [rows, t] = await Promise.all([
    selectEvents({ from: todayIso() }),
    getT(),
  ]);
  const counts = await registrationCounts(rows.map((r) => r.id));
  return rows.map((r) => toEvent(r, counts, locale, t));
}

/** One race and the organizer behind it, or null. */
export async function findEvent(
  slug: string,
  locale: Locale,
): Promise<{ event: RunningEvent; organizer: Organizer } | null> {
  const fixture = getEventBySlug(slug, locale);
  if (fixture) {
    return { event: fixture, organizer: getOrganizer(fixture.organizerId, locale) };
  }

  // Only slugs the fixtures do not know reach the database, which keeps the
  // prerendered fixture pages free of request-time APIs.
  const [rows, t] = await Promise.all([selectEvents({ slug }), getT()]);
  const row = rows[0];
  if (!row) return null;

  const counts = await registrationCounts([row.id]);
  return {
    event: toEvent(row, counts, locale, t),
    organizer: toOrganizer(row),
  };
}

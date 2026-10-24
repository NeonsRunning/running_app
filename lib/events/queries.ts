import { cache } from "react";
import { paymentCode, toAthMovilAccount } from "@/lib/ath-movil/config";
import { addDays, puertoRicoToday } from "@/lib/dates";
import { eventImageUrl } from "@/lib/events/images";
import { LOCALE_TAGS, type Locale } from "@/lib/i18n/config";
import { formatMonthShort, formatWeekdayShort } from "@/lib/i18n/format";
import { getT, getTranslator } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import { initialsOf } from "@/lib/profile/queries";
import { EVENTS_PAGE_SIZE, type EventPage, type EventSearch } from "./search";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  AidStation,
  Organizer,
  RegistrationStatus,
  Runner,
  RunningEvent,
  ScheduleItem,
} from "@/lib/types";

/**
 * Reading events.
 *
 * Every race is a row in the `events` table, written by organizers from
 * /publish. Rows are mapped into the `RunningEvent` shape the cards, filters
 * and detail tabs render.
 */

const EVENT_COLUMNS = `
  *,
  event_categories (*),
  organizer:profiles!events_organizer_id_fkey (id, full_name, bio, created_at),
  ath_movil_account:ath_movil_accounts!events_ath_movil_account_id_fkey (id, label, path, qr_path, active)
`;

type EventRow = Tables<"events"> & {
  event_categories: Tables<"event_categories">[];
  organizer: Pick<
    Tables<"profiles">,
    "id" | "full_name" | "bio" | "created_at"
  > | null;
  ath_movil_account: Pick<
    Tables<"ath_movil_accounts">,
    "id" | "label" | "path" | "qr_path" | "active"
  > | null;
};

/**
 * A published row. Drafts may leave these empty; the
 * `events_published_complete` check guarantees a published row does not.
 * Venue and city stay nullable: a race run anywhere in the region has none.
 */
type PublishedRow = EventRow & {
  [K in "type" | "event_date" | "registration_closes"]: NonNullable<EventRow[K]>;
};

function isPublished(row: EventRow): row is PublishedRow {
  return (
    row.status === "published" &&
    row.type !== null &&
    row.event_date !== null &&
    row.registration_closes !== null &&
    (row.anywhere || (row.venue !== null && row.city !== null))
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

/** Today on the island, where every race is dated; see `lib/dates.ts`. */
export function todayIso(): string {
  return puertoRicoToday();
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
      // A category without its own time starts with the event.
      startTime: c.start_time
        ? clock(c.start_time)
        : row.start_time
          ? clock(row.start_time)
          : undefined,
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
    image: eventImageUrl(row.image_path),
    routeImage: eventImageUrl(row.route_image_path),
    medalImage: eventImageUrl(row.medal_image_path),
    acceptsResults: row.accepts_results,
    mailsMedals: row.mails_medals,
    anywhere: row.anywhere,
    city: row.anywhere ? t("events.anywhere.short") : (row.city ?? ""),
    region: row.region,
    place: row.anywhere
      ? t("events.anywhere.place", { region: row.region })
      : `${row.city}, ${row.region}`,
    venue: row.anywhere
      ? t("events.anywhere.place", { region: row.region })
      : (row.venue ?? ""),
    address: row.anywhere
      ? t("events.anywhere.address", { region: row.region })
      : [row.address, row.city, row.postal_code].filter(Boolean).join(", "),
    date: row.event_date,
    dow: formatWeekdayShort(row.event_date, locale),
    day,
    month: formatMonthShort(row.event_date, locale),
    year,
    endDate: row.end_date ?? undefined,
    end:
      row.end_date && row.end_date > row.event_date
        ? {
            dow: formatWeekdayShort(row.end_date, locale),
            day: row.end_date.split("-")[2],
            month: formatMonthShort(row.end_date, locale),
          }
        : undefined,
    startTime: row.start_time ? clock(row.start_time) : undefined,
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
      shippingPrice: row.offers_mail ? Number(row.shipping_price) : null,
    },
    athMovil: row.ath_movil_account?.active
      ? toAthMovilAccount(row.ath_movil_account)
      : undefined,
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
  ids?: string[];
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
  if (where.ids) query = query.in("id", where.ids);
  // Listed until its last day has passed, not just its first.
  if (where.from) query = query.gte("last_day", where.from);

  const { data, error } = await query.order("event_date");
  return error || !data ? [] : (data as unknown as EventRow[]).filter(isPublished);
}

/**
 * How many paid runners are in each category of these events. Counts only:
 * the registrations themselves are private to runner and organizer.
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

/**
 * The caller's own paid sign-up for an event, if they have one. One still
 * waiting on its payment does not count.
 */
export async function getOwnRegistration(
  runnerId: string,
  eventId: string,
): Promise<{
  categoryId: string;
  bib: number;
  amount: number;
  email: string;
  name: string;
} | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("category_id, bib, amount, email, first_name, last_name")
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .maybeSingle();

  return data
    ? {
        categoryId: data.category_id,
        bib: data.bib ?? 0,
        amount: Number(data.amount),
        email: data.email,
        name: `${data.first_name} ${data.last_name}`.trim(),
      }
    : null;
}

/**
 * Where the caller's unpaid sign-up for an event stands with ATH Móvil:
 * waiting for someone to find the payment in the ATH Móvil Business account
 * it went to (`submitted`), or sent back because they could not
 * (`rejected`). Null when neither applies.
 */
export async function getAthMovilStatus(
  runnerId: string,
  eventId: string,
): Promise<
  | {
      state: "submitted";
      categoryId: string;
      submission: {
        amount: number;
        email: string;
        reference: string;
        code: string;
        path: string;
      };
    }
  | { state: "rejected" }
  | null
> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select(
      "id, category_id, amount, email, payment_reference, payment_submitted_at, payment_rejected_at, account:ath_movil_accounts!registrations_ath_movil_account_id_fkey (path)",
    )
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .eq("status", "pending")
    .maybeSingle();

  if (data?.payment_submitted_at) {
    return {
      state: "submitted",
      categoryId: data.category_id,
      submission: {
        amount: Number(data.amount),
        email: data.email,
        reference: data.payment_reference ?? "",
        code: paymentCode(data.id),
        path: data.account?.path ?? "",
      },
    };
  }
  return data?.payment_rejected_at ? { state: "rejected" } : null;
}

/**
 * Slugs of the races a runner has saved. Empty on any failure: a missing
 * heart is a better outcome than a broken page.
 */
export const getSavedSlugs = cache(async function getSavedSlugs(
  runnerId: string,
): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_events")
    .select("event_slug")
    .eq("runner_id", runnerId);

  return error || !data ? [] : data.map((r) => r.event_slug);
});

/** Ids of the database races a runner has signed up and paid for. */
export async function getRegisteredEventIds(
  runnerId: string,
): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .select("event_id")
    .eq("runner_id", runnerId)
    .eq("status", "confirmed");

  return error || !data ? [] : data.map((r) => r.event_id);
}

/**
 * A runner's current sign-ups on published races whose last day has not
 * passed yet, soonest first. A race drops off the list the day after it ends
 * — the runner has either run it or missed it by then. One with an accepted
 * result drops off as soon as the organizer accepts it.
 *
 * Paid sign-ups come with their bib. Unpaid ones come flagged `pending` while
 * their spot is still held: a card payment in progress, or an ATH Móvil
 * payment waiting for review (held until reviewed). A lapsed hold or a
 * rejected payment no longer holds a spot, so it is left out.
 *
 * Row-level security limits `registrations` to the runner's own rows (and an
 * organizer's own races), so this is only meaningful for the signed-in
 * runner's own profile.
 */
export async function getUpcomingRegistrations(
  runnerId: string,
): Promise<Runner["upcoming"]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const [{ data, error }, { data: finished }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, bib, status, category:event_categories!inner(distance), event:events!inner(slug, event_date, last_day, status)",
      )
      .eq("runner_id", runnerId)
      .or(`status.eq.confirmed,hold_expires_at.gt.${new Date().toISOString()}`)
      .eq("event.status", "published")
      .gte("event.last_day", todayIso()),
    supabase
      .from("race_results")
      .select("registration_id")
      .eq("runner_id", runnerId)
      .eq("status", "accepted"),
  ]);

  if (error || !data) return [];

  // A result the organizer accepted means the race is already run, even if
  // its last day has not passed yet.
  const run = new Set((finished ?? []).map((r) => r.registration_id));

  return data
    .filter((r) => !run.has(r.id))
    .sort((a, b) =>
      (a.event.event_date ?? "").localeCompare(b.event.event_date ?? ""),
    )
    .map((r) => ({
      eventSlug: r.event.slug,
      bib: r.bib === null ? "" : String(r.bib),
      category: r.category.distance,
      // Database races have a single open wave; see `toEvent`.
      wave: "Open",
      pending: r.status === "pending",
    }));
}

/** A race kit or finisher medal on its way to the runner by mail. */
export type MailItem = {
  kind: "kit" | "medal";
  registrationId: string;
  eventName: string;
  eventSlug: string;
  eventDate: string | null;
  /** Whether the event page still exists to link to. */
  eventListed: boolean;
  /**
   * `waiting`: a mailed medal not earned yet — `waitingFor` says what for.
   * `preparing`: the organizer has yet to mail it.
   * `pickup`: a medal the runner picks up in person; `pickedUp` once they have.
   */
  status: "waiting" | "preparing" | "shipped" | "pickup" | "pickedUp";
  waitingFor: "result" | "raceDay" | null;
  /** Null until the organizer marks it shipped. */
  shippedAt: string | null;
  tracking: string | null;
  pickedUpAt: string | null;
  /** A medal's way and address, which the runner may change until it is handed over. */
  medalByMail: boolean;
  medalAddress: string | null;
};

/**
 * What the runner has coming, whatever the race date: the kits they paid to
 * have mailed, and the finisher medals of races that mail them — by mail or
 * picked up, as the runner chose, since they may switch until it is handed
 * over. A tracking number matters after the race leaves the calendar. A medal
 * whose finish was disqualified is left out unless it was already handed over.
 *
 * Still to come first — a mailed medal missing its address at the very top —
 * then the most recently handed over.
 */
export async function getMailItems(runnerId: string): Promise<MailItem[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, ships_by_mail, shipped_at, shipping_tracking, medal_by_mail, medal_mailing_address, medal_shipped_at, medal_tracking, medal_picked_up_at, event:events(name, slug, event_date, last_day, status, mails_medals, accepts_results), result:race_results!race_results_registration_id_fkey (status)",
    )
    .eq("runner_id", runnerId)
    .eq("status", "confirmed");

  if (error || !data) return [];

  const today = todayIso();
  const items = data.flatMap((r): MailItem[] => {
    const ev = r.event;
    if (!ev) return [];
    const base = {
      registrationId: r.id,
      eventName: ev.name,
      eventSlug: ev.slug,
      eventDate: ev.event_date,
      eventListed: ev.status === "published",
    };
    const out: MailItem[] = [];

    if (r.ships_by_mail) {
      out.push({
        ...base,
        kind: "kit",
        status: r.shipped_at ? "shipped" : "preparing",
        waitingFor: null,
        shippedAt: r.shipped_at,
        tracking: r.shipping_tracking,
        pickedUpAt: null,
        medalByMail: false,
        medalAddress: null,
      });
    }

    const result = r.result?.status ?? null;
    const handedOver = r.medal_shipped_at ?? r.medal_picked_up_at;
    if (handedOver || (ev.mails_medals && result !== "disqualified")) {
      // The same rule as `medal_earned()` for the mail.
      const finished = ev.accepts_results
        ? result === "accepted"
        : ev.last_day !== null && ev.last_day < today;
      out.push({
        ...base,
        kind: "medal",
        status: r.medal_shipped_at
          ? "shipped"
          : r.medal_picked_up_at
            ? "pickedUp"
            : !r.medal_by_mail
              ? "pickup"
              : finished
                ? "preparing"
                : "waiting",
        waitingFor:
          handedOver || finished || !r.medal_by_mail
            ? null
            : ev.accepts_results
              ? "result"
              : "raceDay",
        shippedAt: r.medal_shipped_at,
        tracking: r.medal_tracking,
        pickedUpAt: r.medal_picked_up_at,
        medalByMail: r.medal_by_mail,
        medalAddress: r.medal_mailing_address,
      });
    }
    return out;
  });

  const done = (i: MailItem) => i.status === "shipped" || i.status === "pickedUp";
  const rank = (i: MailItem) =>
    done(i) ? 2 : i.kind === "medal" && i.medalByMail && !i.medalAddress ? 0 : 1;
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (done(a) && done(b)
        ? (b.shippedAt ?? b.pickedUpAt ?? "").localeCompare(a.shippedAt ?? a.pickedUpAt ?? "")
        : (a.eventDate ?? "").localeCompare(b.eventDate ?? "")),
  );
}

/** Upcoming and ongoing races organizers published, soonest first. */
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

/**
 * One page of the /events search: `search_events()` filters, sorts and picks
 * the ids, then the rows are read and put back in its order. An empty page
 * on any failure, like the rest of the listing.
 */
export async function searchEvents(
  search: EventSearch,
  offset: number,
  locale: Locale,
): Promise<EventPage> {
  const empty = { events: [], total: 0 };
  if (!hasSupabaseEnv()) return empty;

  const today = todayIso();
  let until: string | undefined;
  if (search.withinDays !== undefined) until = addDays(today, search.withinDays);
  const some = <T>(list: T[]) => (list.length ? list : undefined);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_events", {
    p_today: today,
    p_query: search.query.trim() || undefined,
    p_distances: some(search.distances),
    p_types: some(search.types),
    p_difficulties: some(search.difficulties),
    p_statuses: some(search.statuses),
    p_max_price: search.maxPrice,
    p_until: until,
    p_sort: search.sort,
    p_limit: EVENTS_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) {
    console.error("search_events() failed:", error.message);
    return empty;
  }

  const ids = (data ?? []).map((r) => r.id);
  const total = Number(data?.[0]?.total ?? 0);
  if (ids.length === 0) return { events: [], total };

  const [rows, t, counts] = await Promise.all([
    selectEvents({ ids }),
    getTranslator(locale),
    registrationCounts(ids),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    events: ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toEvent(row, counts, locale, t)] : [];
    }),
    total,
  };
}

/** One race and the organizer behind it, or null. */
export async function findEvent(
  slug: string,
  locale: Locale,
): Promise<{ event: RunningEvent; organizer: Organizer } | null> {
  const [rows, t] = await Promise.all([selectEvents({ slug }), getT()]);
  const row = rows[0];
  if (!row) return null;

  const counts = await registrationCounts([row.id]);
  return {
    event: toEvent(row, counts, locale, t),
    organizer: toOrganizer(row),
  };
}

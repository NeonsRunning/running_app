import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Tables } from "@/lib/supabase/database.types";
import type { AidStation, ScheduleItem } from "@/lib/types";
import { EMPTY_EVENT_FORM, type EventFormValues } from "./form";
import { addDays, puertoRicoMidnight } from "@/lib/dates";
import { selectAll } from "@/lib/supabase/paginate";
import { checkInKit, type CheckInKit } from "./check-in-station";
import { todayIso } from "./queries";
import { EVENTS_PAGE_SIZE } from "./search";
import type { Country } from "./vocabulary";

/**
 * Reading an organizer's own events: the dashboard and the edit form.
 *
 * Unlike `queries.ts` this sees drafts and registrations, and it never runs
 * for anyone but the organizer or a platform admin — row-level security
 * returns only their own drafts and only the registrations for their own
 * events (every one, for an admin), and the organizer's queries here filter
 * on the organizer id as well.
 */

type CategoryRow = Tables<"event_categories">;
type EventRow = Tables<"events"> & { event_categories: CategoryRow[] };
/** What the dashboard's totals need of every event. */
type SummaryRow = Pick<
  Tables<"events">,
  "id" | "status" | "last_day" | "registration_closes" | "capacity" | "event_date"
> & { event_categories: Pick<CategoryRow, "capacity">[] };
/**
 * What `organizer_dashboard_summary()` returns: figures added up in the
 * database. Numbers may arrive as strings or numbers depending on size, so
 * they are read through `Number()`.
 */
type OrganizerSummary = {
  per_event: { event_id: string; registered: number; revenue: number }[];
  /** Paid sign-ups and revenue per island day of payment, from the oldest chart bucket on. */
  daily: { day: string; registrations: number; revenue: number }[];
  /** Runners per age group (labels as in `AGE_GROUPS`) and gender. */
  demographics: { age_group: string; gender: "f" | "m" | "x"; count: number }[];
};

const EMPTY_SUMMARY: OrganizerSummary = { per_event: [], daily: [], demographics: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lifecycle shown on a dashboard card; keys under `labels.eventStatus`.
 * "Closed": registration is over, race day still to come.
 * "Removed": taken down by a platform admin, no longer the organizer's to
 * edit or delete.
 */
export type DashboardStatus =
  | "Draft"
  | "Live"
  | "Closing"
  | "Closed"
  | "Finished"
  | "Removed";

export type DashboardEvent = {
  id: string;
  slug: string;
  name: string;
  status: DashboardStatus;
  date: string | null;
  /** Run anywhere in the region, so there is no city. */
  anywhere: boolean;
  city: string | null;
  registered: number;
  capacity: number;
  revenue: number;
  /**
   * Whether `delete_event()` would take it: no paid runner, no cancelled
   * sign-up kept as a payment's record, no ATH Móvil payment under review.
   */
  deletable: boolean;
};

export type Dashboard = {
  totals: {
    registrations: number;
    revenue: number;
    activeEvents: number;
    drafts: number;
  };
  /** Weekly sign-ups, oldest first, labelled by ISO week ("W23"). */
  registrationsSeries: { label: string; value: number }[];
  /** Monthly revenue, oldest first, labelled "Jan"…"Dec". */
  revenueSeries: { label: string; value: number }[];
  demographics: { label: string; women: number; men: number }[];
  /** All the organizer's events, drafts included. */
  eventCount: number;
};

/** One page of the dashboard's event cards. */
export type DashboardEventPage = {
  events: DashboardEvent[];
  /** The organizer's events across every page. */
  total: number;
};

const WEEKS = 12;
const MONTHS = 6;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
/**
 * The demographics chart's rows. `organizer_dashboard_summary()` buckets
 * runners into these same labels; change both together. Revenue there is
 * what the organizer keeps: the amount less our fee and the sales tax.
 */
const AGE_GROUPS = ["Under 20", "20–29", "30–39", "40–49", "50+"] as const;

/** ISO 8601 week number of a UTC date. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** Age in whole years on an ISO date. */
function ageOn(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ey, em, ed] = on.split("-").map(Number);
  return ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0);
}

function dashboardStatus(
  event: SummaryRow,
  registered: number,
  capacity: number,
  today: string,
): DashboardStatus {
  if (event.status === "draft") return "Draft";
  if (event.status === "removed") return "Removed";
  if (event.last_day && event.last_day < today) return "Finished";
  // Sign-ups are over and the race is still to come: neither live nor closing.
  if (event.registration_closes && event.registration_closes < today) return "Closed";
  // Closing: registration ends within a week, or the field is nearly full.
  const weekAhead = addDays(today, 7);
  if (
    (event.registration_closes && event.registration_closes <= weekAhead) ||
    (capacity > 0 && registered / capacity >= 0.9)
  )
    return "Closing";
  return "Live";
}

const EMPTY_DASHBOARD: Dashboard = {
  totals: { registrations: 0, revenue: 0, activeEvents: 0, drafts: 0 },
  registrationsSeries: [],
  revenueSeries: [],
  demographics: [],
  eventCount: 0,
};

/** Seats on offer: the event's own cap, else the sum of its categories'. */
function capacityOf(event: SummaryRow): number {
  return (
    event.capacity ?? event.event_categories.reduce((sum, c) => sum + c.capacity, 0)
  );
}

/**
 * The organizer's event cards, 24 at a time, in date order with undated
 * drafts first. The dashboard renders the first page; the rest come from
 * `GET /api/organizer/events` as the organizer scrolls.
 */
export async function getOrganizerEvents(
  organizerId: string,
  offset: number,
): Promise<DashboardEventPage> {
  if (!hasSupabaseEnv()) return { events: [], total: 0 };

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("events")
    .select("*, event_categories (*)", { count: "exact" })
    .eq("organizer_id", organizerId)
    .order("event_date", { ascending: true, nullsFirst: true })
    // A total order, so consecutive pages never repeat or skip an event.
    .order("id")
    .range(offset, offset + EVENTS_PAGE_SIZE - 1);
  if (error || !data) return { events: [], total: 0 };
  const events = data as EventRow[];

  // Added up in the database: one row per event, not one per runner.
  const regs = new Map<string, { registered: number; revenue: number }>();
  // What else keeps an event from `delete_event()` besides a paid runner,
  // whom the totals count: a cancelled sign-up, or an ATH Móvil payment
  // waiting for review. Few rows, unlike the paid ones.
  const kept = new Set<string>();
  if (events.length) {
    const ids = events.map((e) => e.id);
    const [{ data: rows }, { data: held }] = await Promise.all([
      supabase.rpc("event_signup_totals", { p_event_ids: ids }),
      selectAll((from, to) =>
        supabase
          .from("registrations")
          .select("id, event_id")
          .in("event_id", ids)
          .or("status.eq.cancelled,payment_submitted_at.not.is.null")
          .order("id")
          .range(from, to),
      ),
    ]);
    for (const r of rows ?? []) {
      regs.set(r.event_id, { registered: Number(r.registered), revenue: Number(r.revenue) });
    }
    for (const r of held) kept.add(r.event_id);
  }

  const today = todayIso();
  return {
    events: events.map((e) => {
      const { registered, revenue } = regs.get(e.id) ?? { registered: 0, revenue: 0 };
      const capacity = capacityOf(e);
      return {
        id: e.id,
        slug: e.slug,
        name: e.name,
        status: dashboardStatus(e, registered, capacity, today),
        date: e.event_date,
        anywhere: e.anywhere,
        city: e.city,
        registered,
        capacity,
        revenue,
        deletable: registered === 0 && !kept.has(e.id),
      };
    }),
    total: count ?? events.length,
  };
}

export async function getOrganizerDashboard(
  organizerId: string,
): Promise<Dashboard> {
  if (!hasSupabaseEnv()) return EMPTY_DASHBOARD;

  const supabase = await createClient();
  // Every event, but only the columns the totals read: the cards themselves
  // load a page at a time through `getOrganizerEvents()`.
  // Paged: past the API's 1000-row cap the rest would be left out of every
  // total.
  const { data: eventData } = await selectAll((from, to) =>
    supabase
      .from("events")
      .select(
        "id, status, last_day, registration_closes, capacity, event_date, event_categories (capacity)",
      )
      .eq("organizer_id", organizerId)
      .order("id")
      .range(from, to),
  );
  const events = eventData as SummaryRow[];

  const today = todayIso();

  // Chart buckets are the island's weeks and months, as YYYY-MM-DD, since
  // the database dates each sign-up by the island day it was paid. The
  // oldest is the Monday 11 weeks before this week's, or the first of the
  // month 5 months back, whichever is earlier.
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStarts = Array.from({ length: WEEKS }, (_, i) =>
    addDays(today, -weekday - (WEEKS - 1 - i) * 7),
  );
  const [year, month] = today.split("-").map(Number);
  const monthStarts = Array.from({ length: MONTHS }, (_, i) =>
    new Date(Date.UTC(year, month - 1 - (MONTHS - 1 - i), 1)).toISOString().slice(0, 10),
  );
  const since = puertoRicoMidnight(
    weekStarts[0] < monthStarts[0] ? weekStarts[0] : monthStarts[0],
  );

  // Added up in the database, which returns a few dozen numbers rather than
  // every paid registration. Row-level security decides what it counts.
  const summary = events.length
    ? await supabase
        .rpc("organizer_dashboard_summary", {
          p_organizer_id: organizerId,
          p_since: since.toISOString(),
          p_today: today,
        })
        .then(({ data }) => (data as OrganizerSummary | null) ?? EMPTY_SUMMARY)
    : EMPTY_SUMMARY;

  /* Per event ------------------------------------------------------------- */
  const perEvent = new Map(summary.per_event.map((e) => [e.event_id, e]));
  const statuses = events.map((e) =>
    dashboardStatus(e, Number(perEvent.get(e.id)?.registered ?? 0), capacityOf(e), today),
  );

  /* Weekly sign-ups, last 12 ISO weeks ending this one -------------------- */
  // ISO dates compare as strings.
  const days = summary.daily;
  const registrationsSeries = weekStarts.map((start, i) => {
    const end = weekStarts[i + 1];
    return {
      label: `W${isoWeek(new Date(`${start}T12:00:00Z`))}`,
      value: days
        .filter((d) => d.day >= start && (end === undefined || d.day < end))
        .reduce((sum, d) => sum + Number(d.registrations), 0),
    };
  });

  /* Monthly revenue, last 6 months ending this one ------------------------ */
  const revenueSeries = monthStarts.map((start) => {
    const key = start.slice(0, 7);
    return {
      label: MONTH_LABELS[Number(start.slice(5, 7)) - 1],
      value: Math.round(
        days
          .filter((day) => day.day.slice(0, 7) === key)
          .reduce((sum, day) => sum + Number(day.revenue), 0),
      ),
    };
  });

  /* Age group × gender, at each runner's age on race day ------------------ */
  const demographics = AGE_GROUPS.map((label) => ({ label, women: 0, men: 0 }));
  for (const row of summary.demographics) {
    const group = demographics.find((g) => g.label === row.age_group);
    if (!group) continue;
    // The chart has two series; "x" registrations count in the totals above
    // but not in this split.
    if (row.gender === "f") group.women += Number(row.count);
    else if (row.gender === "m") group.men += Number(row.count);
  }

  const registrations = summary.per_event.reduce((sum, e) => sum + Number(e.registered), 0);
  const revenue = summary.per_event.reduce((sum, e) => sum + Number(e.revenue), 0);

  return {
    totals: {
      registrations,
      revenue: Math.round(revenue),
      // Taking sign-ups: a closed or finished race is not active.
      activeEvents: statuses.filter((s) => s === "Live" || s === "Closing").length,
      drafts: statuses.filter((s) => s === "Draft").length,
    },
    registrationsSeries,
    revenueSeries,
    demographics,
    eventCount: events.length,
  };
}

/* -------------------------------------------------------------------------- */
/* The edit form                                                              */
/* -------------------------------------------------------------------------- */

function decimal(value: number): string {
  return String(Number(value));
}

/** "06:00:00" → "06:00", the value a time input holds. */
function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

/** An event as the wizard's starting values, and whose it is. */
export type EditableEvent = EventFormValues & { organizerId: string };

/**
 * An event as the wizard's starting values, or null if there is no such
 * event, it belongs to someone else, or an admin removed it.
 *
 * `organizerId` limits it to that organizer's events; null opens anyone's,
 * which only a platform admin's row-level security lets through.
 */
export async function getEventForm(
  organizerId: string | null,
  eventId: string,
): Promise<EditableEvent | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("*, event_categories (*)")
    .eq("id", eventId);
  if (organizerId) query = query.eq("organizer_id", organizerId);
  const { data } = await query.maybeSingle();
  if (!data || data.status === "removed") return null;
  const event = data as EventRow & { status: "draft" | "published" };

  // Every row, not only the paid ones, so the wizard offers only what
  // `save_event()` and `delete_event()` will accept:
  //   * a spot counts against a cap while paid or held — by a live checkout,
  //     or by an ATH Móvil payment under review, whose hold is 'infinity';
  //   * any row at all, lapsed or cancelled too, keeps its category from
  //     being removed (a foreign key) and its distance from changing;
  //   * a paid, cancelled or under-review row keeps the event from deletion.
  const { data: regs } = await selectAll((from, to) =>
    supabase
      .from("registrations")
      .select("id, category_id, status, hold_expires_at, payment_submitted_at")
      .eq("event_id", event.id)
      .order("id")
      .range(from, to),
  );
  const now = Date.now();
  const registered = new Map<string, number>();
  const locked = new Set<string>();
  let deletable = true;
  for (const r of regs) {
    locked.add(r.category_id);
    const held =
      r.hold_expires_at !== null &&
      (r.hold_expires_at === "infinity" || Date.parse(r.hold_expires_at) > now);
    if (r.status === "confirmed" || held) {
      registered.set(r.category_id, (registered.get(r.category_id) ?? 0) + 1);
    }
    if (r.status !== "pending" || r.payment_submitted_at !== null) deletable = false;
  }

  const categories = [...event.event_categories]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      distance: c.distance,
      km: decimal(c.distance_km),
      price: decimal(c.price),
      capacity: String(c.capacity),
      start: hhmm(c.start_time),
      registered: registered.get(c.id) ?? 0,
      locked: locked.has(c.id),
    }));

  return {
    organizerId: event.organizer_id,
    id: event.id,
    status: event.status,
    deletable,
    slug: event.slug,
    name: event.name,
    description: event.description,
    type: event.type ?? EMPTY_EVENT_FORM.type,
    eventDate: event.event_date ?? "",
    endDate: event.end_date ?? "",
    startTime: hhmm(event.start_time),
    registrationOpens: event.registration_opens ?? "",
    registrationCloses: event.registration_closes ?? "",
    anywhere: event.anywhere,
    venue: event.venue ?? "",
    address: event.address,
    city: event.city ?? "",
    region: event.region,
    postalCode: event.postal_code ?? "",
    country: event.country as Country,
    capacity: event.capacity === null ? "" : String(event.capacity),
    minimumAge: String(event.minimum_age),
    maximumAge: event.maximum_age === null ? "" : String(event.maximum_age),
    shirtSizes: event.shirt_sizes,
    offersShirt: event.offers_shirt,
    shirtPrice: decimal(event.shirt_price),
    offersPhotos: event.offers_photos,
    photoPrice: decimal(event.photo_price),
    acceptsDonations: event.accepts_donations,
    donationRecipient: event.donation_recipient,
    offersMail: event.offers_mail,
    shippingPrice: decimal(event.shipping_price),
    terrain: event.terrain,
    difficulty: event.difficulty,
    elevationGain: event.elevation_gain ? String(event.elevation_gain) : "",
    cutoff: event.cutoff,
    // Written back in the same one-per-line form the wizard parses.
    aidStations: (event.aid_stations as Omit<AidStation, "label">[])
      .map((a) => `${a.km} — ${a.offers.join(", ")}`)
      .join("\n"),
    schedule: (event.schedule as ScheduleItem[])
      .map((s) => `${s.time} — ${s.label}`)
      .join("\n"),
    parking: event.parking,
    directions: event.directions,
    imagePath: event.image_path ?? "",
    routeImagePath: event.route_image_path ?? "",
    medalImagePath: event.medal_image_path ?? "",
    athMovilAccountId: event.ath_movil_account_id ?? "",
    acceptsResults: event.accepts_results,
    mailsMedals: event.mails_medals,
    // A draft saved before any category was priced reopens with the starter
    // rows rather than an empty list.
    categories: categories.length ? categories : EMPTY_EVENT_FORM.categories,
  };
}

/* -------------------------------------------------------------------------- */
/* An event's registrations                                                   */
/* -------------------------------------------------------------------------- */

export type EventRegistrationRow = {
  id: string;
  bib: number | null;
  runnerName: string;
  email: string;
  phone: string;
  categoryId: string;
  gender: Tables<"registrations">["gender"];
  /** On race day, or today for an undated event. */
  age: number;
  shirtSize: string | null;
  club: string | null;
  /** Where to mail the kit; null when the runner picks it up. */
  mailingAddress: string | null;
  /** When the mailed kit was marked shipped; null until then. */
  shippedAt: string | null;
  shippingTracking: string | null;
  amount: number;
  paymentMethod: Tables<"registrations">["payment_method"];
  /** When the payment was confirmed; the sign-up time if it never recorded one. */
  paidAt: string;
  /** The organizer accepted this runner's finish, so the sign-up stays. */
  hasAcceptedResult: boolean;
  /** A disqualified finish keeps the sign-up too, as the record. */
  hasDisqualifiedResult: boolean;
  /** The finisher medal, on races that mail medals; null on the rest. */
  medal: MedalShipping | null;
};

export type MedalShipping = {
  /** The runner chose the mail; otherwise they pick it up in person. */
  byMail: boolean;
  /** Earned, as `medal_earned()` decides for the mail: once the race is over. */
  finished: boolean;
  /** Earned for a pickup, which can happen at the finish on race day. */
  canHandOut: boolean;
  /** Null until the runner gives one. */
  address: string | null;
  shippedAt: string | null;
  tracking: string | null;
  pickedUpAt: string | null;
};

/** What decides whether an event's runners are owed their medal yet. */
export type MedalRule = {
  mailsMedals: boolean;
  acceptsResults: boolean;
  /** The race's first and last day; null for an undated event. */
  firstDay: string | null;
  lastDay: string | null;
};

/**
 * One event's completed registrations — paid, bib assigned — in bib order.
 * Read through RLS, so it is empty for anyone but the event's organizer and
 * platform admins.
 */
export async function getEventRegistrations(
  eventId: string,
  eventDate: string | null,
  medals: MedalRule,
): Promise<EventRegistrationRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await selectAll((from, to) =>
    supabase
      .from("registrations")
      .select(
        "id, bib, first_name, last_name, email, phone, category_id, gender, birth_date, shirt_size, club, ships_by_mail, mailing_address, shipped_at, shipping_tracking, medal_by_mail, medal_mailing_address, medal_shipped_at, medal_tracking, medal_picked_up_at, amount, payment_method, paid_at, created_at, result:race_results!race_results_registration_id_fkey (status)",
      )
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .order("bib", { ascending: true, nullsFirst: false })
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  if (error) {
    // Most often a column the database does not have yet: a migration
    // still to push.
    console.error(`Registrations for ${eventId} failed to load:`, error.message);
    return [];
  }

  const raceDay = eventDate ?? todayIso();
  // The same rule as `medal_earned()`, which has the final say.
  const today = todayIso();
  const raceOver = medals.lastDay !== null && medals.lastDay < today;
  const raceStarted = medals.firstDay !== null && medals.firstDay <= today;
  return data.map((r) => ({
    id: r.id,
    bib: r.bib,
    runnerName: `${r.first_name} ${r.last_name}`,
    email: r.email,
    phone: r.phone,
    categoryId: r.category_id,
    gender: r.gender,
    age: ageOn(r.birth_date, raceDay),
    shirtSize: r.shirt_size,
    club: r.club,
    mailingAddress: r.ships_by_mail ? r.mailing_address : null,
    shippedAt: r.ships_by_mail ? r.shipped_at : null,
    shippingTracking: r.ships_by_mail ? r.shipping_tracking : null,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    paidAt: r.paid_at ?? r.created_at,
    hasAcceptedResult: r.result?.status === "accepted",
    hasDisqualifiedResult: r.result?.status === "disqualified",
    // A medal handed over before the race stopped mailing them stays on record.
    medal:
      medals.mailsMedals || r.medal_shipped_at || r.medal_picked_up_at
        ? {
            byMail: r.medal_by_mail,
            finished: medals.acceptsResults
              ? r.result?.status === "accepted"
              : raceOver,
            canHandOut: medals.acceptsResults
              ? r.result?.status === "accepted"
              : raceStarted,
            address: r.medal_mailing_address,
            shippedAt: r.medal_shipped_at,
            tracking: r.medal_tracking,
            pickedUpAt: r.medal_picked_up_at,
          }
        : null,
  }));
}

/**
 * Whether runners gather in one place on race day, so there is a tent to
 * check them in at. A virtual race, or one run anywhere, has none.
 */
export function hasInPersonCheckIn(event: {
  anywhere: boolean;
  type: string | null;
}): boolean {
  return !event.anywhere && event.type !== "Virtual Race";
}

/** A runner as the race-day check-in station shows them. */
export type CheckInRunner = {
  id: string;
  bib: number | null;
  name: string;
  /** The category's distance, e.g. "10K". */
  distance: string;
  gender: Tables<"registrations">["gender"];
  /** On race day, or today for an undated event. */
  age: number;
  shirtSize: string | null;
  kit: CheckInKit;
  /**
   * An ATH Móvil payment still waiting on review: listed so the volunteer
   * finds them, but sent to the desk rather than checked in.
   */
  paymentUnderReview: boolean;
  checkedInAt: string | null;
};

export type CheckInList = {
  event: { id: string; name: string; slug: string };
  runners: CheckInRunner[];
};

/**
 * One event's runners for the check-in station, in bib order: the confirmed
 * ones, and those whose ATH Móvil payment is still under review (no bib yet,
 * so they come last). `organizerId` limits it to that organizer's events;
 * null opens anyone's, which only a platform admin's row-level security lets
 * through.
 *
 * Null when the event is not the caller's, or has no check-in; a failed read
 * throws, so the page shows its error and a retry rather than a 404.
 */
export async function getCheckInList(
  organizerId: string | null,
  eventId: string,
): Promise<CheckInList | null> {
  // A malformed id is a missing event, not a failed read.
  if (!hasSupabaseEnv() || !UUID.test(eventId)) return null;

  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, name, slug, status, anywhere, type, event_date, event_categories (id, distance)")
    .eq("id", eventId);
  if (organizerId) query = query.eq("organizer_id", organizerId);
  const { data: event, error: eventError } = await query.maybeSingle();
  if (eventError) {
    throw new Error(`Check-in event ${eventId} failed to load: ${eventError.message}`);
  }
  if (!event || event.status !== "published" || !hasInPersonCheckIn(event)) return null;

  const { data, error } = await selectAll((from, to) =>
    supabase
      .from("registrations")
      .select("id, status, bib, first_name, last_name, category_id, gender, birth_date, shirt_size, ships_by_mail, shipped_at, checked_in_at")
      .eq("event_id", event.id)
      .or("status.eq.confirmed,and(status.eq.pending,payment_submitted_at.not.is.null)")
      .order("bib", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
  if (error) {
    throw new Error(`Check-in list for ${eventId} failed to load: ${error.message}`);
  }

  const distances = new Map(event.event_categories.map((c) => [c.id, c.distance]));
  const raceDay = event.event_date ?? todayIso();
  return {
    event: { id: event.id, name: event.name, slug: event.slug },
    runners: data.map((r) => ({
      id: r.id,
      bib: r.bib,
      name: `${r.first_name} ${r.last_name}`,
      distance: distances.get(r.category_id) ?? "",
      gender: r.gender,
      age: ageOn(r.birth_date, raceDay),
      shirtSize: r.shirt_size,
      kit: checkInKit(r.ships_by_mail, r.shipped_at),
      paymentUnderReview: r.status !== "confirmed",
      checkedInAt: r.checked_in_at,
    })),
  };
}

/** A runner the organizer or an admin took off the event: what refunding them needs. */
export type CancelledRegistrationRow = {
  id: string;
  bib: number | null;
  runnerName: string;
  email: string;
  categoryId: string;
  /** What they paid, in dollars. */
  amount: number;
  paymentMethod: "stripe" | "ath_movil" | null;
  /** The ATH Móvil receipt's reference, to find the payment to refund. */
  paymentReference: string | null;
  cancelledAt: string;
  /** Refunded through Stripe so far, in dollars; 0 when none is recorded. */
  amountRefunded: number;
  /** Stripe's dispute status when the runner's bank disputed the payment. */
  disputeStatus: string | null;
};

/**
 * One event's cancelled registrations, most recent first. Kept as the record
 * of the payment, so whoever refunds the runner knows what they paid and how.
 * Card refunds made in Stripe show up here on their own (the webhook records
 * them); ATH Móvil refunds are not recorded. Read through RLS, like the
 * completed list.
 */
export async function getCancelledRegistrations(
  eventId: string,
): Promise<CancelledRegistrationRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await selectAll((from, to) =>
    supabase
      .from("registrations")
      .select(
        "id, bib, first_name, last_name, email, category_id, amount, payment_method, payment_reference, cancelled_at, amount_refunded, dispute_status",
      )
      .eq("event_id", eventId)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (error) return [];

  return data.map((r) => ({
    id: r.id,
    bib: r.bib,
    runnerName: `${r.first_name} ${r.last_name}`,
    email: r.email,
    categoryId: r.category_id,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    paymentReference: r.payment_reference,
    // Always set on a cancelled row (a check constraint says so).
    cancelledAt: r.cancelled_at ?? "",
    amountRefunded: Number(r.amount_refunded),
    disputeStatus: r.dispute_status,
  }));
}

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Tables } from "@/lib/supabase/database.types";
import type { AidStation, ScheduleItem } from "@/lib/types";
import { EMPTY_EVENT_FORM, type EventFormValues } from "./form";
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
type RegistrationRow = Pick<
  Tables<"registrations">,
  "event_id" | "category_id" | "amount" | "service_fee" | "sales_tax" | "created_at" | "gender" | "birth_date"
>;

/**
 * Lifecycle shown on a dashboard card; keys under `labels.eventStatus`.
 * "Removed": taken down by a platform admin, no longer the organizer's to
 * edit or delete.
 */
export type DashboardStatus =
  | "Draft"
  | "Live"
  | "Closing"
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
const AGE_GROUPS = ["Under 20", "20–29", "30–39", "40–49", "50+"] as const;

/** What the organizer keeps of a sign-up: the amount, less our fee and the sales tax. */
function net(r: { amount: number; service_fee: number; sales_tax: number }): number {
  return Math.max(0, Number(r.amount) - Number(r.service_fee) - Number(r.sales_tax));
}

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

function ageGroup(birthDate: string, on: string): (typeof AGE_GROUPS)[number] {
  const age = ageOn(birthDate, on);
  if (age < 20) return "Under 20";
  if (age < 30) return "20–29";
  if (age < 40) return "30–39";
  if (age < 50) return "40–49";
  return "50+";
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
  // Closing: registration ends within a week, or the field is nearly full.
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
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

  const regs = new Map<string, { registered: number; revenue: number }>();
  if (events.length) {
    const { data: rows } = await supabase
      .from("registrations")
      .select("event_id, amount, service_fee, sales_tax")
      .in("event_id", events.map((e) => e.id))
      .eq("status", "confirmed");
    for (const r of rows ?? []) {
      const sum = regs.get(r.event_id) ?? { registered: 0, revenue: 0 };
      sum.registered += 1;
      sum.revenue += net(r);
      regs.set(r.event_id, sum);
    }
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
  const { data: eventData } = await supabase
    .from("events")
    .select(
      "id, status, last_day, registration_closes, capacity, event_date, event_categories (capacity)",
    )
    .eq("organizer_id", organizerId);
  const events = (eventData ?? []) as SummaryRow[];

  let registrations: RegistrationRow[] = [];
  if (events.length) {
    const { data } = await supabase
      .from("registrations")
      .select("event_id, category_id, amount, service_fee, sales_tax, created_at, gender, birth_date")
      .in("event_id", events.map((e) => e.id))
      // Sign-ups still at the payment step are neither runners nor revenue.
      .eq("status", "confirmed");
    registrations = data ?? [];
  }

  const today = todayIso();
  const now = new Date();

  /* Per event ------------------------------------------------------------- */
  const byEvent = new Map<string, RegistrationRow[]>();
  for (const r of registrations) {
    byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r]);
  }

  const statuses = events.map((e) =>
    dashboardStatus(e, byEvent.get(e.id)?.length ?? 0, capacityOf(e), today),
  );

  /* Weekly sign-ups, last 12 ISO weeks ending this one -------------------- */
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (WEEKS - 1 - i) * 7);
    return d;
  });
  const registrationsSeries = weekStarts.map((start, i) => {
    const end = weekStarts[i + 1]?.getTime() ?? Infinity;
    return {
      label: `W${isoWeek(start)}`,
      value: registrations.filter((r) => {
        const t = Date.parse(r.created_at);
        return t >= start.getTime() && t < end;
      }).length,
    };
  });

  /* Monthly revenue, last 6 months ending this one ------------------------ */
  const revenueSeries = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1 - i), 1));
    const key = d.toISOString().slice(0, 7);
    return {
      label: MONTH_LABELS[d.getUTCMonth()],
      value: Math.round(
        registrations
          .filter((r) => r.created_at.slice(0, 7) === key)
          .reduce((sum, r) => sum + net(r), 0),
      ),
    };
  });

  /* Age group × gender, at each runner's age on race day ------------------ */
  const eventDate = new Map(events.map((e) => [e.id, e.event_date ?? today]));
  const demographics = AGE_GROUPS.map((label) => ({ label, women: 0, men: 0 }));
  for (const r of registrations) {
    const group = demographics.find(
      (g) => g.label === ageGroup(r.birth_date, eventDate.get(r.event_id) ?? today),
    );
    if (!group) continue;
    // The chart has two series; "x" registrations count in the totals above
    // but not in this split.
    if (r.gender === "f") group.women += 1;
    else if (r.gender === "m") group.men += 1;
  }

  return {
    totals: {
      registrations: registrations.length,
      revenue: Math.round(registrations.reduce((sum, r) => sum + net(r), 0)),
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

  const { data: regs } = await supabase
    .from("registrations")
    .select("category_id")
    .eq("event_id", event.id)
    .eq("status", "confirmed");
  const registered = new Map<string, number>();
  for (const r of regs ?? []) {
    registered.set(r.category_id, (registered.get(r.category_id) ?? 0) + 1);
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
    }));

  return {
    organizerId: event.organizer_id,
    id: event.id,
    status: event.status,
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
  amount: number;
  paymentMethod: Tables<"registrations">["payment_method"];
  /** When the payment was confirmed; the sign-up time if it never recorded one. */
  paidAt: string;
  /** The organizer accepted this runner's finish, so the sign-up stays. */
  hasAcceptedResult: boolean;
};

/**
 * One event's completed registrations — paid, bib assigned — in bib order.
 * Read through RLS, so it is empty for anyone but the event's organizer and
 * platform admins.
 */
export async function getEventRegistrations(
  eventId: string,
  eventDate: string | null,
): Promise<EventRegistrationRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, bib, first_name, last_name, email, phone, category_id, gender, birth_date, shirt_size, club, ships_by_mail, mailing_address, amount, payment_method, paid_at, created_at, result:race_results!race_results_registration_id_fkey (status)",
    )
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .order("bib", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (error || !data) return [];

  const raceDay = eventDate ?? todayIso();
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
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    paidAt: r.paid_at ?? r.created_at,
    hasAcceptedResult: r.result?.status === "accepted",
  }));
}

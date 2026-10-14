import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Tables } from "@/lib/supabase/database.types";
import type { AidStation, ScheduleItem } from "@/lib/types";
import { EMPTY_EVENT_FORM, type EventFormValues } from "./form";
import { SERVICE_FEE } from "./pricing";
import { todayIso } from "./queries";
import type { Country } from "./vocabulary";

/**
 * Reading an organizer's own events: the dashboard and the edit form.
 *
 * Unlike `queries.ts` this sees drafts and registrations, and it never runs
 * for anyone but the organizer — row-level security returns only their own
 * drafts and only the registrations for their own events, and every query
 * here filters on the organizer id as well.
 */

type CategoryRow = Tables<"event_categories">;
type EventRow = Tables<"events"> & { event_categories: CategoryRow[] };
type RegistrationRow = Pick<
  Tables<"registrations">,
  "event_id" | "category_id" | "amount" | "created_at" | "gender" | "birth_date"
>;

/** Lifecycle shown on a dashboard card; keys under `labels.eventStatus`. */
export type DashboardStatus = "Draft" | "Live" | "Closing" | "Finished";

export type DashboardEvent = {
  id: string;
  slug: string;
  name: string;
  status: DashboardStatus;
  date: string | null;
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
  events: DashboardEvent[];
};

const WEEKS = 12;
const MONTHS = 6;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const AGE_GROUPS = ["Under 20", "20–29", "30–39", "40–49", "50+"] as const;

/** What the organizer keeps of a sign-up: the amount, less our fee. */
function net(amount: number): number {
  return Math.max(0, Number(amount) - SERVICE_FEE);
}

/** ISO 8601 week number of a UTC date. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

function ageGroup(birthDate: string, on: string): (typeof AGE_GROUPS)[number] {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ey, em, ed] = on.split("-").map(Number);
  const age = ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0);
  if (age < 20) return "Under 20";
  if (age < 30) return "20–29";
  if (age < 40) return "30–39";
  if (age < 50) return "40–49";
  return "50+";
}

function dashboardStatus(
  event: EventRow,
  registered: number,
  capacity: number,
  today: string,
): DashboardStatus {
  if (event.status === "draft") return "Draft";
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
  events: [],
};

export async function getOrganizerDashboard(
  organizerId: string,
): Promise<Dashboard> {
  if (!hasSupabaseEnv()) return EMPTY_DASHBOARD;

  const supabase = await createClient();
  const { data: eventData } = await supabase
    .from("events")
    .select("*, event_categories (*)")
    .eq("organizer_id", organizerId)
    .order("event_date", { ascending: true, nullsFirst: true });
  const events = (eventData ?? []) as EventRow[];

  let registrations: RegistrationRow[] = [];
  if (events.length) {
    const { data } = await supabase
      .from("registrations")
      .select("event_id, category_id, amount, created_at, gender, birth_date")
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

  const cards: DashboardEvent[] = events.map((e) => {
    const regs = byEvent.get(e.id) ?? [];
    const capacity =
      e.capacity ?? e.event_categories.reduce((sum, c) => sum + c.capacity, 0);
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      status: dashboardStatus(e, regs.length, capacity, today),
      date: e.event_date,
      city: e.city,
      registered: regs.length,
      capacity,
      revenue: regs.reduce((sum, r) => sum + net(r.amount), 0),
    };
  });

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
          .reduce((sum, r) => sum + net(r.amount), 0),
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
      revenue: Math.round(cards.reduce((sum, c) => sum + c.revenue, 0)),
      activeEvents: cards.filter((c) => c.status === "Live" || c.status === "Closing").length,
      drafts: cards.filter((c) => c.status === "Draft").length,
    },
    registrationsSeries,
    revenueSeries,
    demographics,
    events: cards,
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

/**
 * One of the organizer's events as the wizard's starting values, or null if
 * there is no such event or it belongs to someone else.
 */
export async function getEventForm(
  organizerId: string,
  eventId: string,
): Promise<EventFormValues | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, event_categories (*)")
    .eq("id", eventId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (!data) return null;
  const event = data as EventRow;

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
    // A draft saved before any category was priced reopens with the starter
    // rows rather than an empty list.
    categories: categories.length ? categories : EMPTY_EVENT_FORM.categories,
  };
}

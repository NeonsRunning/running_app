"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/auth/session";
import { isIsoDate, puertoRicoToday } from "@/lib/dates";
import { scheduleEventSavedEmails } from "@/lib/email/event-updated";
import { getProfile } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import { EVENT_IMAGE_BUCKET, isOwnImagePath } from "./images";
import { PHOTO_PRICE, SHIPPING_PRICE, SHIRT_PRICE } from "./pricing";
import type { Json, Tables } from "@/lib/supabase/database.types";
import type { AidStation, ScheduleItem } from "@/lib/types";
import {
  COUNTRIES,
  DIFFICULTIES,
  DISTANCES,
  EVENT_TYPES,
  SHIRT_SIZES,
  isOneOf,
} from "./vocabulary";

/**
 * Saving, publishing and deleting events.
 *
 * Same conventions as the profile actions: errors come back as keys under
 * `publish.errors`, and the session decides who the event belongs to — the
 * form never names an organizer.
 *
 * The organizer checks here are for the error message. The guarantee is the
 * row-level security on `events`, which refuses any write unless the caller's
 * own profile says organizer and the row is theirs — or, for an edit, the
 * caller is a platform admin — whatever this file does.
 */

export type EventFormState = {
  /** Field name to a key under `publish.errors`. */
  fieldErrors?: Record<string, string>;
  /** A key under `publish.errors`. */
  error?: string;
  /** Set on success: the row as it now stands. */
  saved?: {
    id: string;
    slug: string;
    status: "draft" | "published";
    /** Stored category id by distance. */
    categoryIds: Record<string, string>;
  };
};

const LIMITS = {
  name: 120,
  description: 4000,
  venue: 120,
  address: 200,
  city: 80,
  region: 80,
  postalCode: 12,
  terrain: 80,
  cutoff: 20,
  notes: 1000,
  donationRecipient: 120,
  categories: 7,
} as const;

/** Postgres error codes this file tells apart. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
/** `raise exception` in our own functions; the message is an error key. */
const RAISED = "P0001";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys `save_event()` raises that belong beside the categories. */
const CATEGORY_ERRORS = new Set([
  "categoriesRequired",
  "capacityBelowRegistered",
  "categoryDistanceLocked",
]);

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readAll(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((v) => (typeof v === "string" ? v.trim() : ""));
}

/** A whole number in range, `null` for an empty input, `NaN` for garbage. */
function readInt(value: string, min: number, max: number): number | null {
  if (value === "") return null;
  if (!/^\d+$/.test(value)) return NaN;
  const n = Number(value);
  return n >= min && n <= max ? n : NaN;
}

/** Accepts "45", "45.50" and the Spanish "45,50". */
function readDecimal(value: string): number {
  const normalized = value.replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
}

const TIME_24 = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar date: "2026-02-31" is refused, not rolled into March. */
const isDate = isIsoDate;

/** "18:00" → "6:00 PM", the clock format the fixtures and `formatClock` use. */
function to12h(hour: number, minute: string): string {
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

/** A time typed by hand: "18:00", "6:00 PM", "6:00pm". */
function parseClock(value: string): string | null {
  const match = /^(\d{1,2}):([0-5]\d)\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, h, minute, marker] = match;
  let hour = Number(h);
  if (marker) {
    if (hour < 1 || hour > 12) return null;
    const pm = marker.toLowerCase().startsWith("p");
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return to12h(hour, minute);
}

/** Lines are "left — right"; an em dash, en dash or spaced hyphen all work. */
const LINE_SPLIT = /\s*(?:—|–|\s-\s)\s*/;

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** "3 — Water, electrolyte" per line. Null if any line does not parse. */
function parseAidStations(value: string): Omit<AidStation, "label">[] | null {
  const out: Omit<AidStation, "label">[] = [];
  for (const line of lines(value)) {
    const [left, ...rest] = line.split(LINE_SPLIT);
    const km = readDecimal(left.replace(/\s*km$/i, ""));
    const offers = rest
      .join(" ")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (Number.isNaN(km) || km <= 0 || offers.length === 0) return null;
    out.push({ km, offers });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** "4:00 PM — Check-in opens" per line. Null if any line does not parse. */
function parseSchedule(value: string): ScheduleItem[] | null {
  const out: ScheduleItem[] = [];
  for (const line of lines(value)) {
    const [left, ...rest] = line.split(LINE_SPLIT);
    const time = parseClock(left);
    const label = rest.join(" — ").trim();
    if (!time || !label) return null;
    out.push({ time, label });
  }
  return out;
}

/**
 * Turn an event name into a URL slug: ASCII, lowercase, hyphenated. The same
 * NFD trick as `slugify_handle` in the profiles migration, so "Carrera del
 * Niño" becomes `carrera-del-nino`.
 */
function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[^\u0000-\u007f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug.length >= 3 ? slug : `${slug || "race"}-run`;
}

type Category = {
  id: string | null;
  distance: (typeof DISTANCES)[number];
  distance_km: number;
  price: number;
  capacity: number;
  /** Null when the distance starts with the event. */
  start_time: string | null;
};

/**
 * The category rows, in display order.
 *
 * A draft may carry rows the organizer has not priced yet: a new row with
 * neither price nor cap filled in is left out of a draft rather than failing
 * it. Anything partly filled in still has to be complete.
 */
function readCategories(
  formData: FormData,
  publishing: boolean,
): { categories: Category[] } | { error: string } {
  const ids = readAll(formData, "category_id");
  const distances = readAll(formData, "category_distance");
  const kms = readAll(formData, "category_km");
  const prices = readAll(formData, "category_price");
  const capacities = readAll(formData, "category_capacity");
  const starts = readAll(formData, "category_start");

  if (distances.length > LIMITS.categories) return { error: "categoriesTooMany" };

  const categories: Category[] = [];
  for (let i = 0; i < distances.length; i++) {
    const id = ids[i] ?? "";
    const untouched = !id && !prices[i] && !capacities[i];
    if (!publishing && untouched) continue;

    const distance = distances[i];
    const km = readDecimal(kms[i] ?? "");
    const price = readDecimal(prices[i] ?? "");
    const capacity = readInt(capacities[i] ?? "", 1, 100000);
    const start = starts[i] ?? "";

    if (
      (id && !UUID.test(id)) ||
      !isOneOf(DISTANCES, distance) ||
      Number.isNaN(km) ||
      km <= 0 ||
      km > 500 ||
      Number.isNaN(price) ||
      price > 100000 ||
      capacity === null ||
      Number.isNaN(capacity) ||
      (start !== "" && !TIME_24.test(start))
    ) {
      return { error: "categoryIncomplete" };
    }
    categories.push({
      id: id || null,
      distance,
      distance_km: km,
      price,
      capacity,
      start_time: start || null,
    });
  }

  if (publishing && categories.length === 0) return { error: "categoriesRequired" };

  const unique = new Set(categories.map((c) => c.distance));
  if (unique.size !== categories.length) return { error: "categoryDuplicate" };

  return { categories };
}

/**
 * The signed-in organizer's client and id, or the error to show instead.
 * Every action re-reads the user rather than trusting anything the form sent.
 *
 * With `allowAdmin`, a platform admin passes too, organizer or not: they may
 * edit anyone's event, though never create or delete one.
 */
async function organizerSession({ allowAdmin = false } = {}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "sessionExpired" } as const;

  const [profile, admin] = await Promise.all([
    getProfile(data.user.id),
    allowAdmin ? isPlatformAdmin() : false,
  ]);
  if (!profile?.isOrganizer && !admin) return { error: "notOrganizer" } as const;

  return { supabase, userId: data.user.id, admin } as const;
}

type EventColumns = Omit<
  Tables<"events">,
  | "id"
  | "organizer_id"
  | "slug"
  | "published_at"
  | "created_at"
  | "updated_at"
  // Generated from event_date and end_date.
  | "last_day"
>;

/**
 * Save the wizard: create or update, as a draft or published.
 *
 * `intent` is "draft" or "publish". A draft only needs a name; publishing
 * needs everything a runner reads before signing up. An event that is already
 * published stays published, so every save of one is held to the publishing
 * rules.
 */
export async function saveEventAction(
  _prev: EventFormState | undefined,
  formData: FormData,
): Promise<EventFormState> {
  const id = readText(formData, "id") || null;
  if (id && !UUID.test(id)) return { error: "eventNotFound" };

  // Only an edit is open to admins; a new event is always the caller's own.
  const session = await organizerSession({ allowAdmin: Boolean(id) });
  if ("error" in session) return { error: session.error };
  const { supabase, userId, admin } = session;

  // The whole row: who gets emailed about the save compares it with the new one.
  let existing: Tables<"events"> | null = null;
  if (id) {
    // An admin edits any organizer's event; anyone else only their own.
    let query = supabase.from("events").select("*").eq("id", id);
    if (!admin) query = query.eq("organizer_id", userId);
    const { data } = await query.maybeSingle();
    // A removed event is the platform's now; the policy refuses the save too.
    if (!data || data.status === "removed") return { error: "eventNotFound" };
    existing = data;
  }

  const publishing =
    readText(formData, "intent") === "publish" ||
    existing?.status === "published";

  const fieldErrors: Record<string, string> = {};
  /** A missing value only counts against a listing that is going live. */
  const requireFor = (field: string, present: boolean, key: string) => {
    if (publishing && !present) fieldErrors[field] = key;
  };

  /* Basic info ------------------------------------------------------------ */
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const type = readText(formData, "type");
  const eventDate = readText(formData, "event_date");
  const endDate = readText(formData, "end_date");
  const startTime = readText(formData, "start_time");
  const opens = readText(formData, "registration_opens");
  const closes = readText(formData, "registration_closes");

  if (name.length < 3) fieldErrors.name = "nameRequired";
  else if (name.length > LIMITS.name) fieldErrors.name = "nameTooLong";
  if (description.length > LIMITS.description)
    fieldErrors.description = "descriptionTooLong";
  if (!isOneOf(EVENT_TYPES, type)) fieldErrors.type = "typeRequired";

  // Compared as ISO strings, which sort as dates; "today" is the island's.
  // A published race that already happened can still be edited, as long as
  // its date is left alone. A draft gets no such pass: publishing one dated
  // in the past would list a race nobody can run.
  const today = puertoRicoToday();
  const live = existing?.status === "published";
  if (eventDate && !isDate(eventDate)) fieldErrors.event_date = "dateInvalid";
  else if (eventDate && eventDate < today && !(live && eventDate === existing?.event_date))
    fieldErrors.event_date = "dateInPast";
  else requireFor("event_date", Boolean(eventDate), "dateRequired");

  // Optional: left empty, the race ends the day it starts. It decides how
  // long the event stays listed on /events.
  if (endDate && !isDate(endDate)) fieldErrors.end_date = "dateInvalid";
  else if (endDate && isDate(eventDate) && endDate < eventDate)
    fieldErrors.end_date = "endBeforeStart";
  else if (endDate && endDate < today && !(live && endDate === existing?.end_date))
    fieldErrors.end_date = "dateInPast";

  // Optional: a race runners start any time across its dates has none, and
  // a one-day race may not have announced it yet.
  if (startTime && !TIME_24.test(startTime)) fieldErrors.start_time = "timeInvalid";

  // Up to the race's last day: a multi-day or virtual race can take sign-ups
  // until its end date.
  const lastDay = isDate(endDate) ? endDate : eventDate;
  if (closes && !isDate(closes)) fieldErrors.registration_closes = "dateInvalid";
  else if (closes && isDate(lastDay) && closes > lastDay)
    fieldErrors.registration_closes = "closesAfterEvent";
  // Going live with registration already closed would list a race nobody can
  // sign up for. Once live, an organizer may still close it early.
  else if (publishing && !live && closes && closes < today)
    fieldErrors.registration_closes = "closesInPast";
  else requireFor("registration_closes", Boolean(closes), "dateRequired");

  if (opens && !isDate(opens)) fieldErrors.registration_opens = "dateInvalid";
  else if (opens && isDate(closes) && opens > closes)
    fieldErrors.registration_opens = "opensAfterCloses";

  /* Location -------------------------------------------------------------- */
  // A race run anywhere in the region keeps no place of its own; what the
  // hidden fields still hold is dropped rather than half-shown.
  const anywhere = formData.get("anywhere") === "on";
  const place = (key: string) => (anywhere ? "" : readText(formData, key));
  const venue = place("venue");
  const address = place("address");
  const city = place("city");
  const region = readText(formData, "region");
  const postalCode = place("postal_code");
  const country = readText(formData, "country");

  if (venue.length > LIMITS.venue) fieldErrors.venue = "tooLong";
  else requireFor("venue", anywhere || Boolean(venue), "venueRequired");
  if (address.length > LIMITS.address) fieldErrors.address = "tooLong";
  if (city.length > LIMITS.city) fieldErrors.city = "tooLong";
  else requireFor("city", anywhere || Boolean(city), "cityRequired");
  if (region.length > LIMITS.region) fieldErrors.region = "tooLong";
  if (postalCode.length > LIMITS.postalCode) fieldErrors.postal_code = "tooLong";
  if (!isOneOf(COUNTRIES, country)) fieldErrors.country = "countryRequired";

  /* Categories ------------------------------------------------------------ */
  const parsedCategories = readCategories(formData, publishing);
  if ("error" in parsedCategories) fieldErrors.categories = parsedCategories.error;

  /* Registration ---------------------------------------------------------- */
  const capacity = readInt(readText(formData, "capacity"), 1, 1000000);
  const minimumAge = readInt(readText(formData, "minimum_age"), 0, 99);
  const maximumAge = readInt(readText(formData, "maximum_age"), 1, 120);
  const shirtSizes = readAll(formData, "shirt_sizes").filter((s) =>
    isOneOf(SHIRT_SIZES, s),
  ) as (typeof SHIRT_SIZES)[number][];

  /* Extras ---------------------------------------------------------------- */
  // A switched-off extra still saves its price, so it comes back when the
  // organizer turns it on again; only a price that is on offer must be valid.
  const offersShirt = formData.get("offers_shirt") === "on";
  const offersPhotos = formData.get("offers_photos") === "on";
  const acceptsDonations = formData.get("accepts_donations") === "on";
  const offersMail = formData.get("offers_mail") === "on";
  const acceptsResults = formData.get("accepts_results") === "on";
  const mailsMedals = formData.get("mails_medals") === "on";
  const donationRecipient = readText(formData, "donation_recipient");
  const shirtPrice = readDecimal(readText(formData, "shirt_price"));
  const photoPrice = readDecimal(readText(formData, "photo_price"));
  const shippingPrice = readDecimal(readText(formData, "shipping_price"));
  const validPrice = (n: number) => !Number.isNaN(n) && n <= 1000;

  if (offersShirt && !validPrice(shirtPrice)) fieldErrors.shirt_price = "priceInvalid";
  if (offersShirt && shirtSizes.length === 0)
    fieldErrors.shirt_sizes = "shirtSizesRequired";
  if (offersPhotos && !validPrice(photoPrice)) fieldErrors.photo_price = "priceInvalid";
  if (offersMail && !validPrice(shippingPrice))
    fieldErrors.shipping_price = "priceInvalid";
  if (donationRecipient.length > LIMITS.donationRecipient)
    fieldErrors.donation_recipient = "tooLong";
  else if (acceptsDonations && !donationRecipient)
    fieldErrors.donation_recipient = "donationRecipientRequired";

  if (Number.isNaN(capacity)) fieldErrors.capacity = "numberInvalid";
  if (Number.isNaN(minimumAge)) fieldErrors.minimum_age = "numberInvalid";
  if (Number.isNaN(maximumAge)) fieldErrors.maximum_age = "numberInvalid";
  else if (
    maximumAge !== null &&
    minimumAge !== null &&
    !Number.isNaN(minimumAge) &&
    maximumAge < minimumAge
  )
    fieldErrors.maximum_age = "maxBelowMin";

  /* Details --------------------------------------------------------------- */
  const terrain = readText(formData, "terrain");
  const difficulty = readText(formData, "difficulty");
  const elevation = readInt(readText(formData, "elevation_gain"), 0, 20000);
  const cutoff = readText(formData, "cutoff");
  const aidStations = parseAidStations(readText(formData, "aid_stations"));
  const schedule = parseSchedule(readText(formData, "schedule"));
  const parking = readText(formData, "parking");
  const directions = readText(formData, "directions");

  if (terrain.length > LIMITS.terrain) fieldErrors.terrain = "tooLong";
  if (!isOneOf(DIFFICULTIES, difficulty)) fieldErrors.difficulty = "difficultyRequired";
  if (Number.isNaN(elevation)) fieldErrors.elevation_gain = "numberInvalid";
  if (cutoff.length > LIMITS.cutoff) fieldErrors.cutoff = "tooLong";
  if (!aidStations) fieldErrors.aid_stations = "aidStationsFormat";
  if (!schedule) fieldErrors.schedule = "scheduleFormat";
  if (parking.length > LIMITS.notes) fieldErrors.parking = "tooLong";
  if (directions.length > LIMITS.notes) fieldErrors.directions = "tooLong";

  /* Images ---------------------------------------------------------------- */
  // Uploaded by the browser already; only a path into the caller's own
  // folder is accepted, so no one can point a listing at another's file.
  // The image already on the event stays acceptable as it is: an admin's
  // edit keeps the organizer's files, and the organizer keeps an admin's.
  const usable = (path: string, current: string | null | undefined) =>
    !path || path === current || isOwnImagePath(path, userId);
  const imagePath = readText(formData, "image_path");
  if (!usable(imagePath, existing?.image_path))
    fieldErrors.image_path = "imageInvalid";
  const routeImagePath = readText(formData, "route_image_path");
  if (!usable(routeImagePath, existing?.route_image_path))
    fieldErrors.route_image_path = "imageInvalid";
  const medalImagePath = readText(formData, "medal_image_path");
  if (!usable(medalImagePath, existing?.medal_image_path))
    fieldErrors.medal_image_path = "imageInvalid";

  /* Payments -------------------------------------------------------------- */
  // One of the accounts admins listed; `save_event` checks it is still live.
  const athMovilAccountId = readText(formData, "ath_movil_account_id");
  if (athMovilAccountId && !UUID.test(athMovilAccountId))
    fieldErrors.ath_movil_account_id = "athMovilAccountInvalid";

  if (Object.keys(fieldErrors).length || "error" in parsedCategories) {
    return { fieldErrors };
  }

  /* Write ----------------------------------------------------------------- */
  // Every column, every time: `save_event` writes the whole row, and a key
  // left out would land as null.
  const event: EventColumns = {
    status: publishing ? "published" : "draft",
    name,
    description,
    type: type as (typeof EVENT_TYPES)[number],
    event_date: eventDate || null,
    end_date: endDate || null,
    start_time: startTime || null,
    registration_opens: opens || null,
    registration_closes: closes || null,
    anywhere,
    venue: venue || null,
    address,
    city: city || null,
    region: region || "Puerto Rico",
    postal_code: postalCode || null,
    country,
    difficulty: difficulty as (typeof DIFFICULTIES)[number],
    terrain,
    elevation_gain: elevation ?? 0,
    cutoff,
    capacity,
    minimum_age: minimumAge ?? 0,
    maximum_age: maximumAge,
    shirt_sizes: shirtSizes,
    offers_shirt: offersShirt,
    shirt_price: validPrice(shirtPrice) ? shirtPrice : SHIRT_PRICE,
    offers_photos: offersPhotos,
    photo_price: validPrice(photoPrice) ? photoPrice : PHOTO_PRICE,
    accepts_donations: acceptsDonations,
    donation_recipient: donationRecipient,
    offers_mail: offersMail,
    shipping_price: validPrice(shippingPrice) ? shippingPrice : SHIPPING_PRICE,
    aid_stations: aidStations ?? [],
    schedule: schedule ?? [],
    parking,
    directions,
    image_path: imagePath || null,
    route_image_path: routeImagePath || null,
    medal_image_path: medalImagePath || null,
    ath_movil_account_id: athMovilAccountId || null,
    accepts_results: acceptsResults,
    mails_medals: mailsMedals,
  };

  // A slug is chosen once, from the first saved name, and kept: links to a
  // published race must not break when it is renamed.
  const base = existing?.slug ?? slugify(name);

  for (let n = 1; n <= 20; n++) {
    const slug = existing || n === 1 ? base : `${base}-${n}`;

    const { data, error } = await supabase.rpc("save_event", {
      p_id: id,
      p_slug: slug,
      p_event: event as unknown as Json,
      p_categories: parsedCategories.categories as unknown as Json,
    });

    if (data) {
      // A replaced or removed image is no longer shown anywhere. Best effort:
      // a leftover file costs storage, not correctness.
      const replaced = [
        existing?.image_path !== data.image_path && existing?.image_path,
        existing?.route_image_path !== data.route_image_path && existing?.route_image_path,
        existing?.medal_image_path !== data.medal_image_path && existing?.medal_image_path,
      ].filter((p): p is string => Boolean(p));
      if (replaced.length) {
        await supabase.storage.from(EVENT_IMAGE_BUCKET).remove(replaced);
      }

      // Hand back the category ids so the wizard's next save updates these
      // rows rather than replacing them. Distance is unique per event.
      const { data: rows } = await supabase
        .from("event_categories")
        .select("id, distance")
        .eq("event_id", data.id);

      if (existing) {
        await scheduleEventSavedEmails({
          before: existing,
          saved: data,
          byAdmin: admin && existing.organizer_id !== userId,
        });
      }

      revalidatePath("/", "layout");
      return {
        saved: {
          id: data.id,
          slug: data.slug,
          // Never "removed": the update policy refuses a removed row.
          status: data.status === "published" ? "published" : "draft",
          categoryIds: Object.fromEntries(
            (rows ?? []).map((r) => [r.distance, r.id]),
          ),
        },
      };
    }

    // Someone else's race has this slug: try the next suffix. Anything else
    // will not change on retry.
    if (
      !existing &&
      error?.code === UNIQUE_VIOLATION &&
      error.message.includes("events_slug_key")
    )
      continue;
    // A removed category still has runners in it.
    if (error?.code === FOREIGN_KEY_VIOLATION)
      return { fieldErrors: { categories: "categoryHasRegistrations" } };
    if (error?.code === RAISED && CATEGORY_ERRORS.has(error.message))
      return { fieldErrors: { categories: error.message } };
    if (error?.code === RAISED && error.message === "eventCapacityBelowRegistered")
      return { fieldErrors: { capacity: error.message } };
    // Not a listed account, or retired while the wizard was open.
    if (error?.code === RAISED && error.message === "athMovilAccountInvalid")
      return { fieldErrors: { ath_movil_account_id: "athMovilAccountInvalid" } };
    if (error?.code === RAISED && error.message === "eventNotFound")
      return { error: "eventNotFound" };
    return { error: "saveFailed" };
  }

  return { error: "saveFailed" };
}

/**
 * Delete one of the caller's events, and its images with it. Refused once a
 * runner has paid or an ATH Móvil payment awaits review; unpaid checkouts are
 * cleared with the event (see `delete_event()`).
 *
 * `unsaved` names images the wizard uploaded since its last save: they are
 * on no row yet, so only the caller knows to drop them.
 */
export async function deleteEventAction(
  id: string,
  unsaved: string[] = [],
): Promise<{ ok?: true; error?: string }> {
  if (!UUID.test(id)) return { error: "eventNotFound" };

  const session = await organizerSession();
  if ("error" in session) return { error: session.error };

  const { data, error } = await session.supabase.rpc("delete_event", {
    p_event_id: id,
  });

  if (
    error?.code === RAISED &&
    (error.message === "eventHasRegistrations" ||
      error.message === "eventNotFound")
  )
    return { error: error.message };
  if (error || !data) return { error: "deleteFailed" };

  // Best effort, as on save: a leftover file costs storage, not correctness.
  const images = [
    ...new Set([
      data.image_path,
      data.route_image_path,
      data.medal_image_path,
      // Arrives from the browser: only files in the caller's own folder.
      ...(Array.isArray(unsaved) ? unsaved : []).filter(
        (p) => typeof p === "string" && isOwnImagePath(p, session.userId),
      ),
    ]),
  ].filter((p): p is string => Boolean(p));
  if (images.length) {
    await session.supabase.storage.from(EVENT_IMAGE_BUCKET).remove(images);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

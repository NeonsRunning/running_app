"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SHIRT_SIZES, isOneOf } from "./vocabulary";

/**
 * Signing up for a race published from /publish.
 *
 * This validates the shape of what the runner typed so the form can point at
 * a field. Everything that depends on other rows — the race is live and open,
 * there is a spot left, the runner is old enough, which bib comes next, what
 * it costs — is decided by `register_for_event()` inside one locked
 * transaction, and comes back as a key under `register.errors`.
 *
 * No card is charged: there is no payment provider yet. The amount stored is
 * what the runner owes.
 */

export type RegistrationInput = {
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  /** The flow's select values: female, male, other, undisclosed. */
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  club: string;
  shirtSize: string | null;
  wantsPhotos: boolean;
  donation: number;
};

export type RegistrationResult =
  | { ok: true; bib: number; amount: number; email: string }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The same pattern the `registrations` table checks. */
const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;

/** What the database knows how to explain; anything else is a generic failure. */
const KNOWN_ERRORS = new Set([
  "sessionExpired",
  "eventUnavailable",
  "registrationClosed",
  "alreadyRegistered",
  "soldOut",
  "ageNotEligible",
  "extrasChanged",
  "shirtSizeUnavailable",
  "donationInvalid",
]);

const GENDER: Record<string, "f" | "m" | "x"> = {
  female: "f",
  male: "m",
  other: "x",
  undisclosed: "x",
};

export async function registerForEventAction(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const trim = (v: string) => (typeof v === "string" ? v.trim() : "");
  const details = {
    first_name: trim(input.firstName),
    last_name: trim(input.lastName),
    email: trim(input.email),
    phone: trim(input.phone),
    birth_date: trim(input.dob),
    gender: GENDER[input.gender],
    emergency_contact_name: trim(input.emergencyName),
    emergency_contact_phone: trim(input.emergencyPhone),
    club: trim(input.club),
    shirt_size: input.shirtSize,
    wants_photos: Boolean(input.wantsPhotos),
    donation: Number(input.donation),
  };

  if (
    !UUID.test(input.categoryId) ||
    !details.first_name ||
    details.first_name.length > 80 ||
    !details.last_name ||
    details.last_name.length > 80 ||
    !EMAIL.test(details.email) ||
    !PHONE.test(details.phone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(details.birth_date) ||
    !details.gender ||
    !details.emergency_contact_name ||
    details.emergency_contact_name.length > 80 ||
    !PHONE.test(details.emergency_contact_phone) ||
    details.club.length > 80 ||
    (details.shirt_size !== null && !isOneOf(SHIRT_SIZES, details.shirt_size)) ||
    !Number.isFinite(details.donation)
  ) {
    return { ok: false, error: "detailsInvalid" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "sessionExpired" };

  const { data, error } = await supabase.rpc("register_for_event", {
    p_category_id: input.categoryId,
    p_details: details,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    return { ok: false, error: KNOWN_ERRORS.has(key) ? key : "registrationFailed" };
  }

  // Spots left and "almost full" badges change with every sign-up.
  revalidatePath("/", "layout");
  return { ok: true, bib: data.bib, amount: Number(data.amount), email: data.email };
}

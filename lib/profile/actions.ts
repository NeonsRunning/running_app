"use server";

import { revalidatePath } from "next/cache";
import { SHIRT_SIZES } from "@/lib/events/vocabulary";
import { isOwnImagePath } from "@/lib/events/images";
import { AVATAR_BUCKET } from "./avatars";
import { ADDRESS_LIMITS, POSTAL_CODE, isStateCode } from "./address";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile server actions.
 *
 * Same conventions as the auth actions: errors come back as dictionary keys
 * rather than sentences — resolved against `settings.errors` — and nothing
 * user-facing is written here.
 *
 * Every action re-reads the user from Supabase instead of trusting anything
 * the form sent. A server action is a public POST endpoint: the row it writes
 * is chosen by the session, never by the payload, so a hand-crafted request
 * can only ever edit its own sender's profile.
 */

export type ProfileState = {
  /** Field name to a key under `settings.errors`. */
  fieldErrors?: Record<string, string>;
  /** A key under `settings.errors`. */
  error?: string;
  ok?: boolean;
};

const LIMITS = { name: 80, city: 80, club: 80, bio: 280 } as const;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Empty inputs clear the column rather than storing "". */
function orNull(value: string): string | null {
  return value === "" ? null : value;
}

/* -------------------------------------------------------------------------- */
/* Profile details                                                            */
/* -------------------------------------------------------------------------- */

export async function updateProfileAction(
  _prev: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const name = readText(formData, "name");
  const city = readText(formData, "city");
  const club = readText(formData, "club");
  const bio = readText(formData, "bio");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "nameRequired";
  else if (name.length > LIMITS.name) fieldErrors.name = "nameTooLong";
  if (city.length > LIMITS.city) fieldErrors.city = "cityTooLong";
  if (club.length > LIMITS.club) fieldErrors.club = "clubTooLong";
  if (bio.length > LIMITS.bio) fieldErrors.bio = "bioTooLong";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: name,
      city: orNull(city),
      club: orNull(club),
      bio: orNull(bio),
    })
    .eq("id", userData.user.id)
    // Selecting the row back turns "no profile to update" — a user whose
    // trigger never ran — into a visible failure instead of a silent no-op.
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  // The header renders the name and initials, so the whole tree is stale.
  revalidatePath("/", "layout");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Profile photo                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Point the profile at a photo the browser has already uploaded, or at none.
 *
 * The file itself never passes through here — `ProfilePhoto` converts and
 * uploads it straight to storage — so this only checks that the path sits in
 * the caller's own folder (the database checks it again) and swaps it in.
 * The photo it replaces is deleted afterwards: nothing else points at it.
 */
export async function setAvatarAction(path: string | null): Promise<ProfileState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };
  const userId = userData.user.id;

  if (path !== null && !isOwnImagePath(path, userId)) {
    return { error: "photoInvalid" };
  }

  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  const previous = before?.avatar_path;
  if (previous && previous !== path) {
    // Best effort: an orphaned file costs storage, not correctness.
    await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  }

  // The header's account chip shows the photo too.
  revalidatePath("/", "layout");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Race-day details                                                           */
/* -------------------------------------------------------------------------- */

/** The same pattern `profile_private` and `registrations` check. */
const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;
const GENDERS = ["f", "m", "x"] as const;

/**
 * The private half: what every registration asks for.
 *
 * Every field is optional here — a runner may fill in some now and the rest at
 * their first sign-up — but whatever is filled in has to be something a
 * registration would accept, so the pre-filled form never starts out invalid.
 */
export async function updateRaceDetailsAction(
  _prev: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const birthDate = readText(formData, "birthDate");
  const gender = readText(formData, "gender");
  const shirtSize = readText(formData, "shirtSize");
  const phone = readText(formData, "phone");
  const emergencyName = readText(formData, "emergencyName");
  const emergencyPhone = readText(formData, "emergencyPhone");

  const fieldErrors: Record<string, string> = {};
  if (
    birthDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      birthDate <= "1900-01-01" ||
      birthDate > new Date().toISOString().slice(0, 10))
  )
    fieldErrors.birthDate = "birthDateInvalid";
  if (phone && !PHONE.test(phone)) fieldErrors.phone = "phoneInvalid";
  if (emergencyName.length > LIMITS.name)
    fieldErrors.emergencyName = "nameTooLong";
  if (emergencyPhone && !PHONE.test(emergencyPhone))
    fieldErrors.emergencyPhone = "phoneInvalid";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { data, error } = await supabase
    .from("profile_private")
    .update({
      birth_date: orNull(birthDate),
      // Anything off the menu clears the column rather than failing the cast.
      gender: GENDERS.find((g) => g === gender) ?? null,
      shirt_size: SHIRT_SIZES.find((s) => s === shirtSize) ?? null,
      phone: orNull(phone),
      emergency_contact_name: orNull(emergencyName),
      emergency_contact_phone: orNull(emergencyPhone),
    })
    .eq("id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/[lang]/runners/[id]", "page");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Mailing address                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where a medal is mailed when a registration picks "send by mail".
 *
 * All or nothing, as the database insists: an empty form clears the address,
 * and a started one has to be finished. Only the second street line is
 * optional.
 */
export async function updateMailingAddressAction(
  _prev: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const line1 = readText(formData, "addressLine1");
  const line2 = readText(formData, "addressLine2");
  const city = readText(formData, "addressCity");
  const state = readText(formData, "addressState").toUpperCase();
  const postalCode = readText(formData, "addressPostalCode");

  // The state select always posts a value, so it alone doesn't start an address.
  const clearing = !line1 && !line2 && !city && !postalCode;

  const fieldErrors: Record<string, string> = {};
  if (!clearing) {
    if (!line1) fieldErrors.addressLine1 = "addressLineRequired";
    else if (line1.length > ADDRESS_LIMITS.line)
      fieldErrors.addressLine1 = "addressLineTooLong";
    if (line2.length > ADDRESS_LIMITS.line)
      fieldErrors.addressLine2 = "addressLineTooLong";
    if (!city) fieldErrors.addressCity = "addressCityRequired";
    else if (city.length > ADDRESS_LIMITS.city)
      fieldErrors.addressCity = "cityTooLong";
    if (!isStateCode(state)) fieldErrors.addressState = "addressStateInvalid";
    if (!POSTAL_CODE.test(postalCode))
      fieldErrors.addressPostalCode = "postalCodeInvalid";
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { data, error } = await supabase
    .from("profile_private")
    .update(
      clearing
        ? {
            address_line1: null,
            address_line2: null,
            address_city: null,
            address_state: null,
            address_postal_code: null,
          }
        : {
            address_line1: line1,
            address_line2: orNull(line2),
            address_city: city,
            address_state: state,
            address_postal_code: postalCode,
          },
    )
    .eq("id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/[lang]/runners/[id]/settings", "page");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Privacy                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Show or hide the profile from other runners.
 *
 * Called from a change handler inside `startTransition` rather than from a
 * form, because a switch that needs a save button is a switch people forget
 * to save.
 */
export async function setProfileVisibilityAction(
  isPublic: boolean,
): Promise<ProfileState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/", "layout");
  return { ok: true };
}

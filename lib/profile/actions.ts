"use server";

import { revalidatePath } from "next/cache";
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

/* -------------------------------------------------------------------------- */
/* Account type                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Switch a runner's account on to the organizer tools.
 *
 * The upgrade is self-serve and reversible in principle, but it is a write to
 * the profile row, not to the user's metadata: `account_type` is what every
 * organizer-only screen reads, and only the owner's own row is writable.
 */
export async function becomeOrganizerAction(
  _prev: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  void formData;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ account_type: "organizer" })
    .eq("id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/", "layout");
  return { ok: true };
}

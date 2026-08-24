import type { Enums, Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * Reading profiles.
 *
 * Rows come out of Postgres in snake_case and are mapped here into the
 * camelCase shapes the rest of the app speaks, the same way `lib/data.ts`
 * hands out domain objects rather than raw fixtures. Nothing above this
 * module should have to know a column name.
 *
 * Authorization is the database's job, not this file's: row-level security
 * already limits `profiles` to public rows plus the caller's own, and
 * `profile_private` to the caller's own. A missing row therefore reads the
 * same as a hidden one — `null` — which is what a stranger should see.
 */

export type AccountType = Enums<"account_type">;
export type Gender = Enums<"profile_gender">;
export type ShirtSize = Enums<"shirt_size">;

/** The public half: what a visitor sees on a runner's page. */
export type Profile = {
  id: string;
  handle: string;
  name: string;
  /** Rendered in the avatar chip until profile photos exist. */
  initials: string;
  accountType: AccountType;
  isOrganizer: boolean;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  club: string | null;
  isPublic: boolean;
  joinedAt: string;
};

/** The owner-only half: contact details and what registration needs. */
export type ProfileDetails = {
  birthDate: string | null;
  gender: Gender | null;
  shirtSize: ShirtSize | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  locale: string;
};

const PROFILE_COLUMNS =
  "id, handle, full_name, account_type, avatar_url, bio, city, club, is_public, created_at";

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

type ProfileRow = Pick<
  Tables<"profiles">,
  | "id"
  | "handle"
  | "full_name"
  | "account_type"
  | "avatar_url"
  | "bio"
  | "city"
  | "club"
  | "is_public"
  | "created_at"
>;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    name: row.full_name,
    initials: initialsOf(row.full_name),
    accountType: row.account_type,
    isOrganizer: row.account_type === "organizer",
    avatarUrl: row.avatar_url,
    bio: row.bio,
    city: row.city,
    club: row.club,
    isPublic: row.is_public,
    joinedAt: row.created_at,
  };
}

/**
 * One user's profile, or null.
 *
 * Null covers three cases the caller should treat alike: no project
 * configured, no such user, and a private profile belonging to someone else.
 * `maybeSingle` is what keeps "no row" out of the error channel.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  return error || !data ? null : toProfile(data);
}

/**
 * One profile by its handle, or null if it is private.
 *
 * Nothing calls this today — `/runners/[id]` is keyed by account id — but the
 * handle stays unique in the database, so this is what a vanity-URL redirect
 * or a "handle already taken" check would be built on.
 */
export async function getProfileByHandle(
  handle: string,
): Promise<Profile | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  return error || !data ? null : toProfile(data);
}

/**
 * The caller's own contact and race-day details.
 *
 * Only ever the caller's own: row-level security answers with nothing for any
 * other id, whatever this function is asked for.
 */
export async function getProfileDetails(
  userId: string,
): Promise<ProfileDetails | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_private")
    .select(
      "birth_date, gender, shirt_size, phone, emergency_contact_name, emergency_contact_phone, locale",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    birthDate: data.birth_date,
    gender: data.gender,
    shirtSize: data.shirt_size,
    phone: data.phone,
    emergencyContactName: data.emergency_contact_name,
    emergencyContactPhone: data.emergency_contact_phone,
    locale: data.locale,
  };
}

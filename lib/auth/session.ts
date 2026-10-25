import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { localizePath } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import {
  getProfile,
  initialsOf,
  type AccountType,
  type Profile,
} from "@/lib/profile/queries";
import { NEXT_PARAM, isRecentRecovery } from "./routes";

export type { AccountType, Profile };

/** The signed-in account: the auth record plus the row the app renders from. */
export type Account = {
  user: User;
  /** Null only if the profile trigger has not run for this user yet. */
  profile: Profile | null;
};

/** The account shape the UI renders, derived from the profile. */
export type Session = {
  signedIn: boolean;
  isOrganizer: boolean;
  /** Reviews ATH Móvil payments at /admin/payments. */
  isAdmin: boolean;
  name: string;
  initials: string;
  /** The profile photo for the account chip; null shows the initials. */
  avatarUrl: string | null;
  /** The auth user id — what `/runners/[id]` is keyed by. */
  id: string;
  email: string;
  unreadNotifications: number;
};

export const GUEST_SESSION: Session = {
  signedIn: false,
  isOrganizer: false,
  isAdmin: false,
  name: "",
  initials: "",
  avatarUrl: null,
  id: "",
  email: "",
  unreadNotifications: 0,
};

/**
 * The signed-in user, or null.
 *
 * Always `getUser()` and never `getSession()`: the former revalidates the
 * access token with Supabase, while the latter trusts a cookie the browser
 * could have rewritten. Every authorization decision on the server hangs off
 * this function.
 */
export async function getUser(): Promise<User | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

/**
 * Whether the current session was opened by a password-recovery link within
 * the last hour — the one session allowed to set a new password without
 * giving the old one. `getClaims()` verifies the access token before its
 * `amr` claim is trusted. See `isRecentRecovery`.
 */
export async function isRecoverySession(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return false;
  return isRecentRecovery(data.claims.amr, Math.floor(Date.now() / 1000));
}

/**
 * The signed-in user, or a redirect to the login screen.
 *
 * The proxy already turns anonymous traffic away from protected routes, but
 * that check is an optimisation, not the guarantee — it can be bypassed by a
 * route the matcher misses. Pages that show account data call this too.
 */
export async function requireUser(path?: string): Promise<User> {
  const user = await getUser();
  if (user) return user;
  redirect(await loginPath(path));
}

/** The user together with their profile row, or null when signed out. */
export async function getAccount(): Promise<Account | null> {
  const user = await getUser();
  if (!user) return null;
  return { user, profile: await getProfile(user.id) };
}

/** As `requireUser`, for the pages that render profile data. */
export async function requireAccount(path?: string): Promise<Account> {
  const account = await getAccount();
  if (account) return account;
  redirect(await loginPath(path));
}

async function loginPath(next?: string): Promise<string> {
  const locale = await getLocale();
  const login = localizePath("/login", locale);
  return next ? `${login}?${NEXT_PARAM}=${encodeURIComponent(next)}` : login;
}

export function isOrganizer(profile: Profile | null): boolean {
  return profile?.accountType === "organizer";
}

/**
 * The signed-in account if it is an organizer's, null if it is a runner's,
 * and a redirect to login when signed out.
 *
 * Null rather than a 404 so the organizer pages can tell a runner who
 * followed a "publish your race" link how to get access. The role itself is
 * granted by the team in the database; nothing in the app can set it.
 */
export async function requireOrganizer(path?: string): Promise<Account | null> {
  const account = await requireAccount(path);
  return isOrganizer(account.profile) ? account : null;
}

/**
 * Whether the signed-in user is a platform admin: listed in
 * `platform_admins`, which only the team can write to. False when signed out
 * or on any failure.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && data === true;
}

/**
 * The signed-in account if it is a platform admin's, null otherwise, and a
 * redirect to login when signed out. The database functions behind the admin
 * pages check the role again; this only decides what to render.
 */
export async function requireAdmin(path?: string): Promise<Account | null> {
  const account = await requireAccount(path);
  return (await isPlatformAdmin()) ? account : null;
}

/**
 * Project an account onto the session the header and settings render.
 *
 * The profile is the source of truth. The metadata fallback below only
 * matters in the window before the profile row exists — a user created while
 * the trigger was missing, say — and keeps the header showing a name rather
 * than an empty chip.
 */
export function toSession(
  account: Account | null,
  extras: { unreadNotifications?: number; isAdmin?: boolean } = {},
): Session {
  if (!account) return GUEST_SESSION;

  const { user, profile } = account;
  const name = profile?.name ?? fallbackName(user);

  return {
    signedIn: true,
    isOrganizer: isOrganizer(profile),
    isAdmin: extras.isAdmin ?? false,
    name,
    initials: profile?.initials ?? initialsOf(name),
    avatarUrl: profile?.avatarUrl ?? null,
    id: user.id,
    email: user.email ?? "",
    unreadNotifications: extras.unreadNotifications ?? 0,
  };
}

function fallbackName(user: User): string {
  const meta = user.user_metadata ?? {};
  const named = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (named) return named;
  // Better a recognisable stub than an empty avatar chip.
  return user.email?.split("@")[0] ?? "";
}

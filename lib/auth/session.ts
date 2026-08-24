import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { localizePath } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { NEXT_PARAM } from "./routes";

/**
 * Runners and organizers share one account; the distinction is a flag on the
 * user's metadata, set at sign-up and switchable later from settings.
 */
export type AccountType = "runner" | "organizer";

/** The account shape the UI renders, derived from the Supabase user. */
export type Session = {
  signedIn: boolean;
  isOrganizer: boolean;
  name: string;
  initials: string;
  handle: string;
  email: string;
  unreadNotifications: number;
};

export const GUEST_SESSION: Session = {
  signedIn: false,
  isOrganizer: false,
  name: "",
  initials: "",
  handle: "",
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
 * The signed-in user, or a redirect to the login screen.
 *
 * The proxy already turns anonymous traffic away from protected routes, but
 * that check is an optimisation, not the guarantee — it can be bypassed by a
 * route the matcher misses. Pages that show account data call this too.
 */
export async function requireUser(path?: string): Promise<User> {
  const user = await getUser();
  if (user) return user;

  const locale = await getLocale();
  const login = localizePath("/login", locale);
  redirect(path ? `${login}?${NEXT_PARAM}=${encodeURIComponent(path)}` : login);
}

function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const named = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (named) return named;
  // Better a recognisable stub than an empty avatar chip.
  return user.email?.split("@")[0] ?? "";
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function handleOf(user: User, name: string): string {
  const meta = user.user_metadata ?? {};
  if (typeof meta.handle === "string" && meta.handle) return meta.handle;
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      // Strip the combining marks NFD just split off, so "Muñoz" reads "munoz".
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || user.id
  );
}

export function isOrganizer(user: User): boolean {
  return user.user_metadata?.account_type === "organizer";
}

/** Project a Supabase user onto the session the header and settings render. */
export function toSession(
  user: User | null,
  extras: { unreadNotifications?: number } = {},
): Session {
  if (!user) return GUEST_SESSION;

  const name = displayName(user);
  return {
    signedIn: true,
    isOrganizer: isOrganizer(user),
    name,
    initials: initialsOf(name),
    handle: handleOf(user, name),
    email: user.email ?? "",
    unreadNotifications: extras.unreadNotifications ?? 0,
  };
}

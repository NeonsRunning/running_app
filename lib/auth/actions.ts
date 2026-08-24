"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePath,
  type Locale,
} from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { authErrorKey } from "./errors";
import { safeNextPath } from "./routes";

/**
 * Auth server actions.
 *
 * Two conventions run through this file:
 *
 * 1. Errors are keys, not sentences. Supabase answers in English; the app
 *    speaks Spanish first. Actions return dictionary keys — "invalidCredentials",
 *    "emailRequired" — and the form translates them, so no user-facing copy
 *    lives on the server.
 *
 * 2. The locale arrives in the form. `next/root-params` is unavailable inside
 *    server actions, so every form posts a hidden `locale` field and every
 *    redirect is built from it. The value is validated before use, so a
 *    tampered field falls back to the default rather than steering the
 *    redirect somewhere unexpected.
 */

export type AuthState = {
  /** Field name to a key under the calling form's own dictionary namespace. */
  fieldErrors?: Record<string, string>;
  /** A key under `auth.errors`. */
  error?: string;
  /** Set by the actions whose forms swap to a confirmation panel. */
  ok?: boolean;
  /** Echoed back so that confirmation panel can name the address. */
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function readLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Absolute origin for the links Supabase emails out.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set — it is the only value that survives a
 * preview deployment or a proxy that rewrites Host. Otherwise the forwarded
 * headers describe the URL the runner actually typed.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Absolute URL for an email link, carrying the page to land on afterwards. */
async function emailLink(
  route: "/auth/confirm" | "/auth/callback",
  locale: Locale,
  next: string,
): Promise<string> {
  const origin = await siteOrigin();
  const path = localizePath(route, locale);
  return `${origin}${path}?next=${encodeURIComponent(next)}`;
}

/* -------------------------------------------------------------------------- */
/* Password sign-in                                                           */
/* -------------------------------------------------------------------------- */

export async function signInAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const email = readText(formData, "email");
  const password = String(formData.get("password") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "emailRequired";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "emailInvalid";
  if (!password) fieldErrors.password = "passwordRequired";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorKey(error) };

  revalidatePath("/", "layout");
  const next = safeNextPath(readText(formData, "next")) ?? "/dashboard";
  redirect(localizePath(next, locale));
}

/* -------------------------------------------------------------------------- */
/* Sign-up                                                                    */
/* -------------------------------------------------------------------------- */

export async function signUpAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const name = readText(formData, "name");
  const email = readText(formData, "email");
  const password = String(formData.get("password") ?? "");
  const accountType =
    readText(formData, "accountType") === "organizer" ? "organizer" : "runner";

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "nameRequired";
  if (!email) fieldErrors.email = "emailRequired";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "emailInvalid";
  if (password.length < MIN_PASSWORD) fieldErrors.password = "passwordShort";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Lands on the user record as `user_metadata`, which `toSession` reads.
      data: { full_name: name, account_type: accountType },
      emailRedirectTo: await emailLink("/auth/confirm", locale, "/dashboard"),
    },
  });

  if (error) return { error: authErrorKey(error) };

  // With email confirmation switched on, signing up with an address that is
  // already registered returns a decoy user instead of an error — deliberate,
  // so the form cannot be used to enumerate accounts. An empty `identities`
  // array is the tell. Either way the runner sees the same inbox screen, so
  // there is nothing to branch on beyond skipping the revalidate.
  const alreadyRegistered = data.user?.identities?.length === 0;
  if (!alreadyRegistered) revalidatePath("/", "layout");

  // A project with email confirmation switched off hands back a session right
  // away. Sending that runner to the inbox screen would strand them there
  // waiting for a message no one is going to send, so take them straight in.
  if (data.session) redirect(localizePath("/dashboard", locale));

  redirect(
    `${localizePath("/verify-email", locale)}?email=${encodeURIComponent(email)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Email confirmation by six-digit code                                       */
/* -------------------------------------------------------------------------- */

export async function verifyEmailAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const email = readText(formData, "email");
  const token = readText(formData, "token");

  if (!email) return { error: "missingEmail" };
  if (token.length !== 6) return { fieldErrors: { token: "codeInvalid" } };

  const supabase = await createClient();
  // "signup" matches the email `signUp` sent, and the type `resend` below
  // asks for — the code and the link in that message are interchangeable.
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });
  if (error) return { error: authErrorKey(error) };

  revalidatePath("/", "layout");
  redirect(localizePath("/dashboard", locale));
}

export async function resendVerificationAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const email = readText(formData, "email");
  if (!email) return { error: "missingEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: await emailLink("/auth/confirm", locale, "/dashboard"),
    },
  });
  if (error) return { error: authErrorKey(error) };

  return { ok: true, email };
}

/* -------------------------------------------------------------------------- */
/* Password recovery                                                          */
/* -------------------------------------------------------------------------- */

export async function requestPasswordResetAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const email = readText(formData, "email");

  if (!EMAIL_RE.test(email)) return { fieldErrors: { email: "emailInvalid" } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await emailLink("/auth/confirm", locale, "/reset-password"),
  });

  // Rate limiting is worth surfacing: it describes the sender, not the
  // account. Every other failure still reports success, because "no such
  // account" would tell a stranger which addresses are registered.
  if (error?.code?.includes("rate_limit")) return { error: authErrorKey(error) };

  return { ok: true, email };
}

export async function updatePasswordAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const locale = readLocale(formData);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (password.length < MIN_PASSWORD) fieldErrors.password = "passwordShort";
  else if (password !== confirm) fieldErrors.confirm = "passwordMismatch";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();

  // The recovery link signs the runner in before this page renders, so no
  // session means the link expired or was never followed.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorKey(error) };

  revalidatePath("/", "layout");
  redirect(localizePath("/dashboard", locale));
}

/* -------------------------------------------------------------------------- */
/* OAuth, sign-out, account type                                              */
/* -------------------------------------------------------------------------- */

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const next = safeNextPath(readText(formData, "next")) ?? "/dashboard";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await emailLink("/auth/callback", locale, next) },
  });

  if (error || !data.url) redirect(`${localizePath("/login", locale)}?error=oauth`);

  // Supabase has stashed the PKCE verifier in a cookie; the callback route
  // trades the code that comes back for a session.
  redirect(data.url);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);

  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(localizePath("/", locale));
}

/** Switch a runner's account on to the organizer tools. */
export async function becomeOrganizerAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  void formData;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "sessionExpired" };

  const { error } = await supabase.auth.updateUser({
    data: { ...userData.user.user_metadata, account_type: "organizer" },
  });
  if (error) return { error: authErrorKey(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

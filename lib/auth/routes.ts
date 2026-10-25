/**
 * Which routes require a session, and which ones a signed-in runner should
 * never see. Paths here are locale-free (`/organizer`, not `/en/organizer`) —
 * the proxy strips the prefix before asking.
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { localizePath, type Locale } from "@/lib/i18n/config";

/**
 * The `[id]` segment that means "whoever is signed in".
 *
 * A runner's page is keyed by account id, but the nav, the login redirect and
 * the links in a confirmation email all have to name it before any id is
 * known. `/runners/me` is that name: the page resolves it against the session
 * and renders the runner their own profile.
 */
export const SELF_ID = "me";
export const SELF_PROFILE_PATH = `/runners/${SELF_ID}`;

/**
 * Signed-out visitors are sent to the login screen. `/runners/me` is the only
 * entry that sits under an otherwise public route, and the match below is
 * exact-or-slash-boundary, so `/runners/<id>` stays readable by anyone.
 */
const PROTECTED = [
  SELF_PROFILE_PATH,
  "/notifications",
  "/organizer",
  "/admin",
  "/publish",
] as const;

/**
 * Signed-in runners are sent to their own profile. `/reset-password` is
 * deliberately absent: the recovery link signs you in, so that page is only
 * ever reached *with* a session.
 */
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"] as const;

/**
 * How long after following a recovery link the session may set a new password
 * without the old one. The link itself is good for 30 minutes; this leaves
 * time to pick a password once it has been opened.
 */
export const RECOVERY_WINDOW_SECONDS = 60 * 60;

/**
 * Whether a session was opened by a password-recovery link within the window,
 * read from the access token's `amr` claim: Supabase records "recovery" there
 * for a session that `/auth/confirm` opened from a reset email, by either
 * link shape. Any other session — a password sign-in, Google, a confirmation
 * link — has to give the current password before changing it, so a borrowed
 * laptop or a stolen session cookie is not enough to lock the runner out.
 *
 * The plain-string `amr` form (a custom access-token hook can produce it)
 * carries no timestamp, so there a recovery entry counts as recent.
 */
export function isRecentRecovery(
  amr: readonly (string | { method: string; timestamp: number })[] | undefined,
  nowSeconds: number,
): boolean {
  return (amr ?? []).some((entry) =>
    typeof entry === "string"
      ? entry === "recovery"
      : entry.method === "recovery" &&
        nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS,
  );
}

/**
 * Where a `token_hash` email link waits for the runner to press "Continue"
 * before it is spent. See `app/[lang]/auth/confirm`.
 */
export const CONFIRM_LINK_PATH = "/confirm-link";

/** The email link types the app sends: address confirmation and recovery. */
const EMAIL_LINK_TYPES = new Set<EmailOtpType>(["signup", "email", "email_change", "recovery"]);

export function isEmailLinkType(value: string | null | undefined): value is EmailOtpType {
  return typeof value === "string" && EMAIL_LINK_TYPES.has(value as EmailOtpType);
}

/** The query parameter carrying where the visitor was headed before the gate. */
export const NEXT_PARAM = "next";

export function isProtectedPath(path: string): boolean {
  return PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isGuestOnlyPath(path: string): boolean {
  return GUEST_ONLY.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Sanitise a `?next=` value before redirecting to it. Anything that is not a
 * plain app path — a protocol-relative `//evil.com`, an absolute URL — is
 * dropped, so the parameter cannot be used to bounce a runner off-site after
 * login.
 *
 * Browsers read `/\evil.com` as `//evil.com` and strip tabs and newlines
 * before parsing, so a prefix check alone is not enough: backslashes and
 * control characters are refused outright, and the value is resolved the way
 * a browser would to confirm it stays on our origin.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  const base = "http://app.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  // Dot segments collapse during parsing: "/.//evil.com" comes out as
  // "//evil.com", which would leave the site when redirected to.
  if (url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The absolute URL to redirect to for a locale-free app path — a constant,
 * or what `safeNextPath` returned — on `origin`.
 *
 * The path may carry a query string and a fragment (`/events?distance=5K`),
 * so it is parsed into its parts rather than assigned to `pathname`, which
 * would percent-encode the `?` into the path and land on a 404. It is parsed
 * against a placeholder base and only its parts are copied, so even a path
 * that slipped past `safeNextPath` cannot change the origin.
 */
export function appUrl(origin: string, path: string, locale: Locale): URL {
  const parsed = new URL(path, "http://app.invalid");
  const url = new URL(origin);
  url.pathname = localizePath(parsed.pathname, locale);
  url.search = parsed.search;
  url.hash = parsed.hash;
  return url;
}

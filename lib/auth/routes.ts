/**
 * Which routes require a session, and which ones a signed-in runner should
 * never see. Paths here are locale-free (`/settings`, not `/en/settings`) —
 * the proxy strips the prefix before asking.
 */

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
  "/settings",
  "/notifications",
  "/organizer",
  "/publish",
] as const;

/**
 * Signed-in runners are sent to their own profile. `/reset-password` is
 * deliberately absent: the recovery link signs you in, so that page is only
 * ever reached *with* a session.
 */
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"] as const;

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
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

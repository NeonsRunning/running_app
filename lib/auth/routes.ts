/**
 * Which routes require a session, and which ones a signed-in runner should
 * never see. Paths here are locale-free (`/organizer`, not `/en/organizer`) —
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

/** The query parameter carrying where the visitor was headed before the gate. */
export const NEXT_PARAM = "next";

/**
 * The locale-free login path that brings the visitor back to `next`
 * afterwards. Home and the guest-only screens are left out: home is where a
 * login with nowhere to go lands anyway, and returning to the login form
 * itself would loop.
 */
export function loginPath(next?: string | null): string {
  if (!next || next === "/" || isGuestOnlyPath(next.split(/[?#]/)[0])) {
    return "/login";
  }
  return `/login?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}

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

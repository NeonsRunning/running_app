/**
 * Which routes require a session, and which ones a signed-in runner should
 * never see. Paths here are locale-free (`/dashboard`, not `/en/dashboard`) —
 * the proxy strips the prefix before asking.
 */

/** Signed-out visitors are sent to the login screen. */
const PROTECTED = [
  "/dashboard",
  "/settings",
  "/notifications",
  "/organizer",
  "/publish",
] as const;

/**
 * Signed-in runners are sent to their dashboard. `/reset-password` is
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

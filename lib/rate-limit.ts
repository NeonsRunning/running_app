import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { logCritical } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Throttling the server actions that cost something per call: sending email,
 * opening a Stripe payment, trying a password. See the rate_limits migration
 * for why.
 *
 * Counted in Postgres by `hit_rate_limit()`, against keys hashed here first,
 * so neither IP addresses nor email addresses are stored.
 *
 * If the count itself fails — the database is unreachable, or the service
 * role is not configured — production refuses the call and logs a CRITICAL
 * line: a limiter that can be switched off by knocking over its counter is no
 * limit on password guessing. Development lets the call through, so a machine
 * without the service role key can still sign in and send the contact form.
 */

/** How many calls per window, as a Postgres interval. */
export type Limit = { limit: number; window: string };

export const LIMITS = {
  /** Contact form messages, by sender IP and by the address they give. */
  contactPerIp: { limit: 5, window: "1 hour" },
  contactPerEmail: { limit: 3, window: "1 hour" },
  /**
   * Confirmation and password emails from Supabase, by IP and address —
   * sign-ups among them, since each sends a confirmation.
   */
  authEmailPerIp: { limit: 10, window: "1 hour" },
  authEmailPerEmail: { limit: 5, window: "1 hour" },
  /**
   * Password attempts — signing in, and the current password asked for
   * before a change — by IP and by the account's address. Supabase has its
   * own per-IP limit, but every call from this server reaches it from the
   * same few addresses.
   */
  signInPerIp: { limit: 30, window: "15 minutes" },
  signInPerEmail: { limit: 10, window: "15 minutes" },
  /** Checkouts started or repriced; each may open a Stripe PaymentIntent. */
  checkoutPerUser: { limit: 30, window: "1 hour" },
  /** ATH Móvil references submitted; each holds a spot and emails reviewers. */
  athMovilPerUser: { limit: 10, window: "1 hour" },
  /** Deletion requests and withdrawals; each emails the team. */
  deletionPerUser: { limit: 5, window: "1 day" },
  /** Data exports; each reads the whole account. */
  exportPerUser: { limit: 10, window: "1 hour" },
} satisfies Record<string, Limit>;

export type Check = {
  /** What is being limited, e.g. "contact:ip". */
  action: string;
  /** Who: an IP, an address, an account id. Hashed before it is stored. */
  who: string;
  limit: Limit;
};

function hashed(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 40);
}

type HeaderReader = { get(name: string): string | null };

/**
 * The caller's IP, from headers a proxy wrote rather than ones the client
 * could have sent.
 *
 *   1. On Vercel, `x-vercel-forwarded-for`: the platform sets it and drops
 *      any copy the client sent. Off Vercel the same header is just another
 *      client-supplied value, so it is only read there.
 *   2. `x-real-ip`, which Vercel and the usual nginx setup overwrite with the
 *      address the connection came from.
 *   3. The LAST entry of `x-forwarded-for`. Proxies append the address they
 *      saw to whatever the client sent, so the leftmost entries are the
 *      client's to choose and only the rightmost was written by our proxy.
 *
 * Behind more than one proxy the rightmost entry is the inner proxy's own
 * address, which lumps every caller together — too strict, but never
 * spoofable. Have the outer proxy set `x-real-ip` in that case.
 */
export function ipFromHeaders(
  h: HeaderReader,
  onVercel = Boolean(process.env.VERCEL),
): string {
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const last = (value: string | null) => value?.split(",").at(-1)?.trim() || null;
  return (
    (onVercel ? first(h.get("x-vercel-forwarded-for")) : null) ??
    first(h.get("x-real-ip")) ??
    last(h.get("x-forwarded-for")) ??
    "unknown"
  );
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

/** The answer when nothing could be counted: closed in production. */
function unavailable(checks: Check[], reason: string): boolean {
  const failClosed = process.env.NODE_ENV === "production";
  logCritical(
    "RATE_LIMIT_UNAVAILABLE",
    failClosed
      ? "Counting a rate limit failed; refusing the call."
      : "Counting a rate limit failed; letting the call through outside production.",
    { actions: checks.map((c) => c.action), error: reason },
  );
  return !failClosed;
}

/**
 * Count one call against each check and say whether all of them are still
 * within their limits. Every check is counted, even once one is over, so a
 * caller cannot spread their calls across keys to dodge one.
 */
export async function withinLimits(checks: Check[]): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // A development machine without the key: nothing to count with, and
    // nothing worth a CRITICAL line on every call.
    if (process.env.NODE_ENV !== "production") return true;
    return unavailable(checks, "SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      checks.map(async ({ action, who, limit }) => {
        const { data, error } = await admin.rpc("hit_rate_limit", {
          p_key: `${action}:${hashed(who)}`,
          p_limit: limit.limit,
          p_window: limit.window,
        });
        if (error) throw new Error(error.message);
        return data !== false;
      }),
    );
    return results.every(Boolean);
  } catch (err) {
    return unavailable(checks, err instanceof Error ? err.message : String(err));
  }
}

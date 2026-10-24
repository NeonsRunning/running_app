import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { logCritical } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Throttling the server actions that cost something per call: sending email,
 * opening a Stripe payment. See the rate_limits migration for why.
 *
 * Counted in Postgres by `hit_rate_limit()`, against keys hashed here first,
 * so neither IP addresses nor email addresses are stored. If the count itself
 * fails — the database is unreachable, or the service role is not configured
 * in development — the call is let through: a limiter that locks everyone
 * out is worse than one that briefly lets a few extra through.
 */

/** How many calls per window, as a Postgres interval. */
export type Limit = { limit: number; window: string };

export const LIMITS = {
  /** Contact form messages, by sender IP and by the address they give. */
  contactPerIp: { limit: 5, window: "1 hour" },
  contactPerEmail: { limit: 3, window: "1 hour" },
  /** Confirmation and password emails from Supabase, by IP and address. */
  authEmailPerIp: { limit: 10, window: "1 hour" },
  authEmailPerEmail: { limit: 5, window: "1 hour" },
  /** Checkouts started or repriced; each may open a Stripe PaymentIntent. */
  checkoutPerUser: { limit: 30, window: "1 hour" },
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

/**
 * The caller's IP. On Vercel, `x-vercel-forwarded-for` and the first entry of
 * `x-forwarded-for` are set by the platform. Behind any other proxy, make
 * sure it overwrites `x-forwarded-for` rather than appending to what the
 * client sent, or a caller can pick their own IP for every request.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Count one call against each check and say whether all of them are still
 * within their limits. Every check is counted, even once one is over, so a
 * caller cannot spread their calls across keys to dodge one.
 */
export async function withinLimits(checks: Check[]): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  const admin = createAdminClient();
  try {
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
    logCritical("RATE_LIMIT_UNAVAILABLE", "Counting a rate limit failed; letting the call through.", {
      actions: checks.map((c) => c.action),
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

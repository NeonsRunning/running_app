import "server-only";
import { headers } from "next/headers";
import { logCritical } from "@/lib/log";

/**
 * The absolute origin links in emails point at: confirmation and password
 * reset links, and every link in a transactional email.
 *
 *   1. `NEXT_PUBLIC_SITE_URL`, whenever it is set. Set it in production.
 *   2. In Vercel production without it, the project's production domain
 *      (`VERCEL_PROJECT_PRODUCTION_URL`, set by the platform), and a CRITICAL
 *      log line, once per server instance, saying the variable is missing.
 *   3. Otherwise — local development, preview deployments — the request's
 *      forwarded host. Vercel only routes a deployment's own domains to it,
 *      so there the header is trustworthy; behind a proxy that passes any
 *      Host through, it is not, which is why production must not rely on it.
 *
 * Read before `after()`: a page render cannot read headers from inside the
 * callback.
 */
let warned = false;

export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.VERCEL_ENV === "production") {
    if (!warned) {
      warned = true;
      logCritical("SITE_URL_MISSING", "NEXT_PUBLIC_SITE_URL is not set in production.");
    }
    const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (domain) return `https://${domain}`;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

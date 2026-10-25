import "server-only";
import { headers } from "next/headers";
import { logCritical } from "@/lib/log";

/**
 * The absolute origin links in emails point at: confirmation and password
 * reset links, and every link in a transactional email.
 *
 *   1. `NEXT_PUBLIC_SITE_URL`, whenever it is set. Set it in production.
 *   2. On Vercel without it: in production the project's production domain
 *      (`VERCEL_PROJECT_PRODUCTION_URL`), with a CRITICAL log line, once per
 *      server instance, saying the variable is missing; in a preview the
 *      deployment's own URL (`VERCEL_URL`). The platform sets both.
 *   3. Any other production server: none, and this throws. The only other
 *      source is the request's Host or X-Forwarded-Host header, which the
 *      client writes — a password-reset link built from it would carry the
 *      runner's token to whatever host the requester named.
 *   4. Development: the request's host, as long as it is localhost, so
 *      `next dev` works with nothing configured. Any other host — a phone on
 *      the LAN, a tunnel — gets plain localhost rather than its own name.
 *
 * Read before `after()`: a page render cannot read headers from inside the
 * callback.
 */
let warned = false;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/** The origin the environment names, or null if it names none. */
function configuredSiteOrigin(): string | null {
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

  // A preview's own deployment URL, never a header.
  const deployment = process.env.VERCEL_URL;
  if (process.env.VERCEL && deployment) return `https://${deployment}`;

  return null;
}

export async function siteOrigin(): Promise<string> {
  const configured = configuredSiteOrigin();
  if (configured) return configured;

  const h = await headers();

  if (process.env.NODE_ENV === "production") {
    // Reading the headers above first is deliberate: during `next build` it
    // marks the page dynamic instead of prerendering it, so a build without
    // the variable (CI's) still succeeds and the error surfaces on the first
    // real request, where it names what to fix.
    if (!warned) {
      warned = true;
      logCritical("SITE_URL_MISSING", "No site origin is configured; refusing to build links.");
    }
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Production builds every email and " +
        "auth link from it and will not fall back to the request's Host " +
        "header, which the client controls. Set it to the site's public " +
        "origin, e.g. https://your-domain.com.",
    );
  }

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return `http://localhost:${process.env.PORT || 3000}`;
  const proto = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

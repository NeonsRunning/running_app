import type { NextConfig } from "next";

/**
 * Security headers on every response.
 *
 * The Content-Security-Policy is deliberately narrow. A full script policy
 * needs a per-request nonce threaded through the proxy and every inline
 * script, and a wrong one silently breaks Stripe's payment form — so it only
 * says what cannot break a script:
 *
 *   frame-ancestors 'none'  no other site may frame these pages: the admin
 *                           payment review and organizer tools cannot be
 *                           overlaid and clickjacked (X-Frame-Options says
 *                           the same to older browsers)
 *   base-uri 'self'         an injected <base> cannot repoint relative URLs
 *   object-src 'none'       no plugins
 *
 * `form-action 'self'` is left out on purpose: browsers apply it to the
 * redirect after a form posts, and "Sign in with Google" posts to a server
 * action that redirects to accounts.google.com.
 *
 * A fuller policy is sent beside it as Content-Security-Policy-Report-Only:
 * browsers apply none of it, only report (in the console) what it would have
 * blocked, so it can be watched before anything is enforced. Its scripts are
 * still `'unsafe-inline'` — Next's inline bootstrap scripts carry no nonce —
 * so what it would add is the origin list: scripts, frames and connections
 * only to this site, Supabase and Stripe.
 */

/** The Supabase project, for API calls, Realtime and Storage images. */
const supabase = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { https: url.origin, wss: `wss://${url.host}` };
  } catch {
    return null;
  }
})();

const reportOnlyPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  // Profile photos and QR codes live in Supabase Storage; Google sign-in
  // can hand back a Google-hosted avatar.
  ["img-src 'self' data: blob:", supabase?.https, "https://*.stripe.com https://lh3.googleusercontent.com"]
    .filter(Boolean)
    .join(" "),
  "font-src 'self'",
  ["connect-src 'self'", supabase?.https, supabase?.wss, "https://api.stripe.com"]
    .filter(Boolean)
    .join(" "),
  // Stripe's card form and 3-D Secure challenges are frames.
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these; the profile photo picker is a file input.
  // `payment` is left alone: Apple Pay and Google Pay run inside Stripe's
  // frames and need it.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HTTPS only, for two years, subdomains included. Browsers ignore it over
  // plain HTTP, so local development is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  experimental: {
    // `app/global-not-found.tsx`: the 404 for a URL whose first segment is
    // no language, which the `[lang]` root layout cannot render.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

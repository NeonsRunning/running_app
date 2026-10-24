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
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

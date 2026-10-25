import type { MetadataRoute } from "next";
import { LOCALES, localizePath } from "@/lib/i18n/config";
import { siteOrigin } from "@/lib/site-url";

/**
 * Areas crawlers have no business in: sign-in-gated tools (which only
 * redirect to the login screen), the registration flow, and the auth
 * callbacks. Account screens such as /login stay crawlable so crawlers can
 * read their `noindex`; a blocked page can still be listed by URL alone.
 */
const PRIVATE = [
  "/admin",
  "/organizer",
  "/publish",
  "/notifications",
  "/runners/me",
  "/auth/",
  "/events/*/register",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: {
      userAgent: "*",
      // Share images live under /api; link previews fetch them.
      allow: ["/", "/api/og"],
      disallow: [
        "/api/",
        ...PRIVATE.flatMap((p) => LOCALES.map((l) => localizePath(p, l))),
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}

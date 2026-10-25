import type { Metadata } from "next";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_TAGS,
  localizePath,
  type Locale,
} from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Organizer, RunningEvent } from "@/lib/types";

/**
 * Search and sharing metadata shared by the pages.
 *
 * Next merges metadata one top-level key at a time, so a page that sets
 * `alternates` or `openGraph` replaces the root layout's block outright. The
 * helpers here hand each page a complete block rather than a patch.
 */

type Alternates = NonNullable<Metadata["alternates"]>;
type OpenGraph = NonNullable<Metadata["openGraph"]>;

/**
 * Account screens, focused flows and organizer tools: nothing a search engine
 * should list. Links on them may still be followed.
 */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };

/**
 * The origin from configuration alone. Metadata on prerendered pages must not
 * read the request, so this skips `siteOrigin()`'s Host-header fallback; null
 * leaves Next to its own default (the Vercel deployment URL, or localhost).
 */
export function configuredOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && domain) return `https://${domain}`;
  return null;
}

/**
 * The language versions of a locale-free path, keyed by BCP 47 tag, plus
 * `x-default` for visitors whose language is neither.
 */
export function languageAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      LOCALES.map((l) => [LOCALE_TAGS[l], localizePath(path, l)]),
    ),
    "x-default": localizePath(path, DEFAULT_LOCALE),
  };
}

/**
 * Canonical URL and language versions for a locale-free path (`/events`, not
 * `/en/events`). Query strings are left off on purpose: a filtered listing is
 * the same page as the unfiltered one.
 */
export async function pageAlternates(path: string): Promise<Alternates> {
  const locale = await getLocale();
  return {
    canonical: localizePath(path, locale),
    languages: languageAlternates(path),
  };
}

/** `es-PR` → `es_PR`, the form Open Graph wants. */
function ogLocale(locale: Locale): string {
  return LOCALE_TAGS[locale].replace("-", "_");
}

/** The site-wide card, used wherever a page has no image of its own. */
export const DEFAULT_SHARE_IMAGE = "/api/og";

/**
 * The Open Graph block every page carries. Pages that set their own spread
 * this first, since theirs replaces the layout's whole block.
 */
export async function openGraphBase(): Promise<OpenGraph> {
  const locale = await getLocale();
  const t = await getT();
  return {
    type: "website",
    siteName: t("meta.applicationName"),
    locale: ogLocale(locale),
    alternateLocale: LOCALES.filter((l) => l !== locale).map(ogLocale),
    images: [{ url: DEFAULT_SHARE_IMAGE, width: 1200, height: 630 }],
  };
}

/** A generated share card for one race; see `app/api/og/events/[slug]`. */
export function eventShareImage(slug: string, locale: Locale): string {
  return `/api/og/events/${encodeURIComponent(slug)}?lang=${locale}`;
}

/**
 * JSON-LD for a script tag. `<` is escaped so text an organizer typed cannot
 * close the tag early.
 */
export function jsonLd(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/** Every race is dated on the island, which keeps UTC−4 all year. */
const PR_OFFSET = "-04:00";

/** "6:30 PM" → "18:30", or null for anything else. */
function to24h(clock: string | undefined): string | null {
  const m = clock?.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

const SCHEMA = "https://schema.org/";

/**
 * schema.org `SportsEvent` for a race page — what search engines read to show
 * it among event results. `url` and `image` must be absolute.
 */
export function eventJsonLd(
  event: RunningEvent,
  organizer: Organizer,
  urls: { page: string; register: string; image: string },
): object {
  const start = to24h(event.startTime);

  const availability = (c: RunningEvent["categories"][number]) => {
    if (event.registrationStatus === "opening-soon") return `${SCHEMA}PreOrder`;
    if (event.registrationStatus === "closed") return `${SCHEMA}SoldOut`;
    return c.registered >= c.capacity ? `${SCHEMA}SoldOut` : `${SCHEMA}InStock`;
  };

  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    description: event.description[0] ?? event.tagline,
    sport: "Running",
    url: urls.page,
    image: [urls.image],
    startDate: start ? `${event.date}T${start}:00${PR_OFFSET}` : event.date,
    endDate: event.endDate,
    eventStatus: `${SCHEMA}EventScheduled`,
    ...(event.anywhere
      ? {
          eventAttendanceMode: `${SCHEMA}OnlineEventAttendanceMode`,
          location: { "@type": "VirtualLocation", url: urls.page },
        }
      : {
          eventAttendanceMode: `${SCHEMA}OfflineEventAttendanceMode`,
          location: {
            "@type": "Place",
            name: event.venue,
            address: {
              "@type": "PostalAddress",
              streetAddress: event.address || undefined,
              addressLocality: event.city,
              addressRegion: event.region,
            },
          },
        }),
    organizer: {
      "@type": "Organization",
      name: organizer.name,
      url: organizer.website || undefined,
    },
    offers: event.categories.map((c) => ({
      "@type": "Offer",
      name: c.name,
      price: c.price,
      priceCurrency: "USD",
      availability: availability(c),
      url: urls.register,
    })),
  };
}

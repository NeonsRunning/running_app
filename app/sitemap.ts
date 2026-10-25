import type { MetadataRoute } from "next";
import { LOCALES, localizePath } from "@/lib/i18n/config";
import { listPublishedSlugs } from "@/lib/events/queries";
import { getLegalSlugs } from "@/lib/legal";
import { languageAlternates } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * Every page meant to be found, in both languages, each entry naming its
 * other-language version. Pages that are noindexed (results, profiles,
 * community, account screens) are left out.
 */
const STATIC_PATHS = ["/", "/events", "/about", "/faq", "/contact"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, events] = await Promise.all([
    siteOrigin(),
    listPublishedSlugs(),
  ]);

  const entries = (path: string, lastModified?: string) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(path)).map(([tag, url]) => [
        tag,
        `${origin}${url}`,
      ]),
    );
    return LOCALES.map((l) => ({
      url: `${origin}${localizePath(path, l)}`,
      lastModified,
      alternates: { languages },
    }));
  };

  return [
    ...STATIC_PATHS.flatMap((p) => entries(p)),
    ...getLegalSlugs().flatMap((slug) => entries(`/legal/${slug}`)),
    ...events.flatMap((e) => entries(`/events/${e.slug}`, e.updatedAt)),
  ];
}

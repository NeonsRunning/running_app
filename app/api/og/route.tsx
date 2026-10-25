import { getTranslator } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { shareCard } from "@/lib/share-card";

/**
 * The site-wide share card, for every page without an image of its own. It
 * reads nothing from the request, so it is drawn once at build time.
 *
 * It lives under /api rather than as an `opengraph-image` file because the
 * proxy rewrites every dot-less path into `/es/…`: a metadata image route
 * would either 404 at the root or carry an `/es/` URL that redirects.
 */
export const dynamic = "force-static";

export async function GET() {
  const t = await getTranslator(DEFAULT_LOCALE);
  return shareCard({
    eyebrow: t("meta.applicationName"),
    title: t("meta.shareHeadline"),
    lines: ["Puerto Rico · 5K · 10K · 21K · 42K"],
  });
}

import type { NextRequest } from "next/server";
import { findEvent } from "@/lib/events/queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel, eventTypeLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { shareCard } from "@/lib/share-card";

/**
 * One race's share card: name, dates and place. Route handlers have no root
 * params, so the language comes in as
 * `?lang=` (see `eventShareImage`).
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/og/events/[slug]">,
) {
  const { slug } = await ctx.params;
  const lang = request.nextUrl.searchParams.get("lang") ?? "";
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;

  // Only a published race has a card (`findEvent` reads published rows). A
  // miss is not cached, so a race published a moment later gets its card.
  const found = await findEvent(slug, locale);
  if (!found) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { event } = found;
  const t = await getTranslator(locale);
  const fmt = createFormatters(locale);

  return shareCard(
    {
      eyebrow: [
        eventTypeLabel(t, event.type),
        ...event.categories.map((c) => distanceLabel(t, c.name)),
      ].join(" · "),
      title: event.name,
      lines: [fmt.eventDates(event.date, event.endDate), event.place],
    },
    // Previews are fetched once per share, so a few minutes' cache is
    // plenty. Kept short so a removed or renamed race stops showing its old
    // card within about 15 minutes, not a day.
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}

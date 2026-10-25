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

  const found = await findEvent(slug, locale);
  if (!found) return new Response("Not found", { status: 404 });

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
    // Previews are fetched once per share; an hour-old card is fine.
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

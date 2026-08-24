import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecCell } from "@/components/ui/card";
import { Leaderboard } from "@/components/results/leaderboard";
import { LEADERBOARD, getEventBySlug, getEventSlugs } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";

export function generateStaticParams() {
  return getEventSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/results">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const event = getEventBySlug(slug, locale);
  return {
    title: event
      ? t("results.metaTitle", { event: event.name })
      : t("results.metaTitleFallback"),
  };
}

export default async function EventResultsPage(
  props: PageProps<"/[lang]/events/[slug]/results">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const event = getEventBySlug(slug, locale);
  if (!event) notFound();

  const winner = LEADERBOARD[0];

  return (
    <div>
      <header className="border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto max-w-[1600px]">
          <Eyebrow>{fmt.longDate(event.date)}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
            {t("results.heading", { event: event.name })}
          </h1>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href={`/events/${event.slug}`} variant="outline" size="md">
              {t("results.raceInformation")}
            </Button>
            <Button href="/results" variant="ghost" size="md">
              {t("results.allResults")}
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label={t("results.summary")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <SpecCell
          label={t("results.finishers")}
          value={fmt.number(528)}
          className="bg-ink"
        />
        <SpecCell
          label={t("results.winningTime")}
          value={winner.time}
          accent="yellow"
          className="bg-ink"
        />
        <SpecCell
          label={t("results.medianTime")}
          value="52:40"
          className="bg-ink"
        />
        <SpecCell
          label={t("results.distance")}
          value={distanceLabel(t, event.featuredDistance)}
          className="bg-ink"
        />
      </section>

      <div className="mx-auto max-w-[1600px]">
        <Leaderboard rows={LEADERBOARD} slug={event.slug} highlightBib="1048" />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { findEvent } from "@/lib/events/queries";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/results">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const found = await findEvent(slug, locale);
  return {
    title: found
      ? t("results.metaTitle", { event: found.event.name })
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

  const found = await findEvent(slug, locale);
  if (!found) notFound();
  const { event } = found;

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

      {/* Results have no table behind them yet. */}
      <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10">
        <EmptyState
          icon="⏱"
          title={t("results.emptyTitle")}
          body={t("results.emptyBody")}
        />
      </div>
    </div>
  );
}

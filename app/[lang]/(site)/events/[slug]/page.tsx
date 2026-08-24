import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecCell } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { EventDetailTabs } from "@/components/events/event-detail-tabs";
import { SaveButton } from "@/components/events/saved-events";
import { ShareRow } from "@/components/events/share-row";
import {
  daysUntil,
  getEventBySlug,
  getEventSlugs,
  getOrganizer,
} from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel, eventTypeLabel } from "@/lib/i18n/labels";

export function generateStaticParams() {
  return getEventSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const event = getEventBySlug(slug, locale);
  if (!event) return { title: t("events.detail.notFound") };

  return {
    title: event.name,
    description: event.tagline,
  };
}

export default async function EventDetailPage(
  props: PageProps<"/[lang]/events/[slug]">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const event = getEventBySlug(slug, locale);
  if (!event) notFound();

  const organizer = getOrganizer(event.organizerId, locale);
  const days = daysUntil(event.date);
  const spotsLeft = event.capacity - event.registered;
  const featured =
    event.categories.find((c) => c.name === event.featuredDistance) ??
    event.categories[0];

  return (
    <article className="pb-24 lg:pb-0">
      {/* ---------------------------------------------------------------- */}
      {/* Banner                                                           */}
      {/* ---------------------------------------------------------------- */}
      <header className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(120deg,#050505_0%,#050505_46%,#0e2605_72%,#2c6600_96%,#57ad00_118%)]"
        />
        <div aria-hidden="true" className="bg-road-lines absolute inset-0" />

        <div className="relative mx-auto max-w-[1600px] px-4 pt-14 pb-10 sm:px-6 lg:px-10 lg:pt-24 lg:pb-14">
          <div className="flex flex-wrap gap-2.5">
            <Badge tone="yellow">{event.statusLabel}</Badge>
            <Badge tone="outline" className="bg-ink/60 text-fg">
              {eventTypeLabel(t, event.type)}
            </Badge>
          </div>

          <h1 className="mt-5 max-w-4xl font-display text-[2.75rem] leading-[0.88] font-black tracking-[-0.038em] uppercase sm:text-6xl lg:text-[5.5rem]">
            {event.name}
          </h1>

          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[13px] tracking-[0.1em] text-fg-muted uppercase">
            <span>
              {event.city}, {event.region}
            </span>
            <span className="text-neon-yellow">
              {fmt.longDate(event.date)}
            </span>
            <span>
              {t("events.detail.startSuffix", {
                time: fmt.clock(event.startTime),
              })}
            </span>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Key facts                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-label={t("events.detail.glance")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
      >
        <SpecCell
          label={t("events.detail.specDistance")}
          value={distanceLabel(t, event.featuredDistance)}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specStartTime")}
          value={fmt.clock(event.startTime)}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specTerrain")}
          value={event.terrain}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specRegCloses")}
          value={event.registrationCloses}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specSpotsLeft")}
          value={fmt.number(spotsLeft)}
          accent="lime"
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specFrom")}
          value={fmt.moneyWhole(event.fromPrice)}
          accent="yellow"
          className="bg-ink"
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Body + booking rail                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[1fr_400px]">
        <main className="border-line lg:border-r-2">
          <EventDetailTabs event={event} organizer={organizer} />
        </main>

        <aside className="border-t-2 border-line lg:border-t-0">
          {/* On desktop the booking card follows the reader down the page. */}
          <div className="lg:sticky lg:top-20">
            <div className="border-b-2 border-line px-5 py-7 sm:px-7">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-5xl font-black tracking-[-0.03em] text-neon-yellow">
                  {fmt.moneyWhole(featured.price)}
                </span>
                <span className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">
                  {t("events.detail.entry", {
                    category: distanceLabel(t, featured.name),
                  })}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-fg-dim">
                {t("events.detail.priceRises", {
                  date: event.registrationCloses,
                })}
              </p>

              <Button
                href={`/events/${event.slug}/register`}
                block
                size="xl"
                className="mt-6"
              >
                {t("events.detail.registerNow")}
              </Button>

              <SaveButton
                slug={event.slug}
                name={event.name}
                labelled
                className="mt-3"
              />

              <ShareRow
                title={`${event.name} — NEONS RUNNING`}
                path={`/events/${event.slug}`}
                className="mt-3"
              />
            </div>

            <div className="border-b-2 border-line px-5 py-6 sm:px-7">
              <Progress
                value={event.registered}
                max={event.capacity}
                label={t("events.detail.capacity")}
              />
              <p className="mt-3 font-mono text-[11px] tracking-[0.1em] text-neon-lime uppercase">
                {t("events.detail.capacityFull", {
                  percent: Math.round(
                    (event.registered / event.capacity) * 100,
                  ),
                  spots: fmt.number(spotsLeft),
                })}
              </p>
            </div>

            <div className="border-b-2 border-line px-5 py-6 sm:px-7">
              <Eyebrow>{t("events.detail.raceCategories")}</Eyebrow>
              <ul className="mt-4">
                {event.categories.map((c) => {
                  const isFeatured = c.name === event.featuredDistance;
                  return (
                    <li
                      key={c.id}
                      className="flex justify-between border-b-2 border-line py-3 text-[15px] last:border-b-0"
                    >
                      <span
                        className={
                          isFeatured
                            ? "font-black text-neon-lime"
                            : "font-bold"
                        }
                      >
                        {distanceLabel(t, c.name)}
                      </span>
                      <span
                        className={isFeatured ? "text-neon-lime" : "text-fg-muted"}
                      >
                        {fmt.moneyWhole(c.price)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="px-5 py-7 sm:px-7">
              <Eyebrow>{t("events.detail.countdown")}</Eyebrow>
              <p className="mt-3 font-display text-5xl leading-none font-black tracking-[-0.03em]">
                {fmt.number(days)}
                <span className="ml-2 align-middle text-lg font-bold tracking-[0.1em] text-fg-dim">
                  {t("events.detail.days")}
                </span>
              </p>
              <p className="mt-3 text-[13px] text-fg-dim">
                {t("events.detail.registrationCloses", {
                  date: event.registrationCloses,
                })}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Sticky mobile registration bar                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="fixed inset-x-0 bottom-14 z-60 grid grid-cols-[auto_1fr] items-center border-t-2 border-line bg-ink lg:hidden">
        <div className="px-4 py-3">
          <span className="font-display text-xl font-black text-neon-yellow">
            {fmt.moneyWhole(featured.price)}
          </span>
        </div>
        <Button
          href={`/events/${event.slug}/register`}
          size="lg"
          className="h-full min-h-14 rounded-none"
        >
          {t("events.detail.registerNow")}
        </Button>
      </div>
    </article>
  );
}

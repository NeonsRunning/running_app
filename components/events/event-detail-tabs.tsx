"use client";

import { useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecCell } from "@/components/ui/card";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import {
  BibIcon,
  ChipIcon,
  HydrationIcon,
  MedalIcon,
  PhotoIcon,
  ShirtIcon,
} from "@/components/ui/icons";
import { useFormat, useT } from "@/components/i18n/provider";
import {
  aidOfferLabel,
  difficultyLabel,
  distanceLabel,
  startTimeLabel,
  waveLabel,
} from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { IncludedIcon, Organizer, RunningEvent } from "@/lib/types";

/**
 * The five tabs on an event page. Which tab is open is component state rather
 * than a URL parameter: it is a reading position within one event, and the
 * page above it is server-rendered per event either way.
 */
const TAB_ITEMS = [
  { value: "overview", key: "events.tabs.overview" },
  { value: "details", key: "events.tabs.details" },
  { value: "course", key: "events.tabs.course" },
  { value: "schedule", key: "events.tabs.schedule" },
  { value: "organizer", key: "events.tabs.organizer" },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

const INCLUDED_ICONS = {
  bib: BibIcon,
  chip: ChipIcon,
  medal: MedalIcon,
  shirt: ShirtIcon,
  hydration: HydrationIcon,
  photos: PhotoIcon,
} as const;

const INCLUDED_COLOR: Record<IncludedIcon, string> = {
  bib: "text-neon-yellow",
  chip: "text-neon-lime",
  medal: "text-neon-green",
  shirt: "text-neon-yellow",
  hydration: "text-neon-lime",
  photos: "text-neon-green",
};

function IncludedIconMark({ kind }: { kind: IncludedIcon }) {
  const Glyph = INCLUDED_ICONS[kind];
  return <Glyph size={28} className={cn("shrink-0", INCLUDED_COLOR[kind])} />;
}

export function EventDetailTabs({
  event,
  organizer,
}: {
  event: RunningEvent;
  organizer: Organizer;
}) {
  const t = useT();
  const fmt = useFormat();
  const [tab, setTab] = useState<TabValue>("overview");

  return (
    <div>
      <Tabs
        items={TAB_ITEMS.map((item) => ({
          value: item.value,
          label: t(item.key),
        }))}
        value={tab}
        onChange={setTab}
        label={t("events.tabs.label")}
      />

      {/* ---------------------------------------------------------------- */}
      <TabPanel value="overview" active={tab === "overview"}>
        <section className="border-b-2 border-line px-5 py-9 sm:px-8 lg:px-10">
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {t("events.tabs.about")}
          </h2>
          {event.description.map((para, i) => (
            <p
              key={i}
              className={cn(
                "mt-4 max-w-[70ch] text-base leading-relaxed sm:text-[17px]",
                i === 0 ? "text-fg-muted" : "text-fg-dim",
              )}
            >
              {para}
            </p>
          ))}
        </section>

        {/* Listings published from /publish do not describe the kit yet. */}
        {event.included.length > 0 ? (
          <section className="border-b-2 border-line px-5 py-9 sm:px-8 lg:px-10">
            <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
              {t("events.tabs.included")}
            </h2>
            <ul className="mt-6 grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-3">
              {event.included.map((item) => (
                <li key={item.label} className="bg-carbon p-5">
                  <IncludedIconMark kind={item.icon} />
                  <p className="mt-3.5 text-base font-bold">{item.label}</p>
                  <p className="mt-1 text-[13px] text-fg-dim">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="px-5 py-9 sm:px-8 lg:px-10">
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {t("events.tabs.participants")}
          </h2>
          {/* Only the count: who registered is private to runner and
              organizer, so there are no faces to show here. */}
          <div className="mt-6">
            <p className="font-display text-4xl font-black text-neon-lime">
              {fmt.number(event.registered)}
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-fg-dim uppercase">
              {event.registered > 0
                ? t("events.tabs.runnersRegistered")
                : t("events.tabs.noRunnersYet")}
            </p>
          </div>
        </section>
      </TabPanel>

      {/* ---------------------------------------------------------------- */}
      <TabPanel value="details" active={tab === "details"}>
        <div className="grid gap-0.5 bg-line sm:grid-cols-2">
          <SpecCell
            label={t("events.tabs.specDistance")}
            value={t("events.tabs.specDistanceValue", {
              distance: distanceLabel(t, event.featuredDistance),
            })}
            className="bg-ink sm:px-8 lg:px-10"
          />
          <SpecCell
            label={t("events.tabs.specStartTime")}
            value={
              event.startTime
                ? t("events.tabs.specStartTimeValue", {
                    time: fmt.clock(event.startTime),
                  })
                : startTimeLabel(t, fmt, undefined, Boolean(event.endDate))
            }
            className="bg-ink sm:px-8 lg:px-10"
          />
          <SpecCell
            label={t("events.tabs.specCutoff")}
            value={event.cutoff}
            className="bg-ink sm:px-8 lg:px-10"
          />
          <SpecCell
            label={t("events.tabs.specTerrain")}
            value={event.terrain}
            className="bg-ink sm:px-8 lg:px-10"
          />
          <SpecCell
            label={t("events.tabs.specDifficulty")}
            value={difficultyLabel(t, event.difficulty)}
            accent="lime"
            className="bg-ink sm:px-8 lg:px-10"
          />
          <SpecCell
            label={t("events.tabs.specAge")}
            value={
              event.minimumAge > 0
                ? t("events.tabs.ageValue", { age: event.minimumAge })
                : t("events.tabs.ageAll")
            }
            className="bg-ink sm:px-8 lg:px-10"
          />
        </div>

        <div className="px-5 py-9 sm:px-8 lg:px-10">
          <Eyebrow>{t("events.tabs.raceCategories")}</Eyebrow>
          <ul className="mt-4">
            {event.categories.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line py-4"
              >
                <div>
                  <p className="font-display text-xl font-black uppercase">
                    {distanceLabel(t, c.name)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-fg-dim uppercase">
                    {t("events.tabs.categoryMeta", {
                      time: startTimeLabel(
                        t,
                        fmt,
                        c.startTime,
                        Boolean(event.endDate),
                      ),
                      wave: waveLabel(t, c.wave),
                      km: fmt.number(c.distanceKm),
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-black text-neon-yellow">
                    {fmt.moneyWhole(c.price)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-fg-dim">
                    {t("events.tabs.spotsLeft", {
                      count: fmt.number(c.capacity - c.registered),
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </TabPanel>

      {/* ---------------------------------------------------------------- */}
      <TabPanel value="course" active={tab === "course"}>
        {event.routeImage ? (
          <RouteImage event={event} src={event.routeImage} />
        ) : (
          <CourseMap event={event} />
        )}
        <div className="grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-4">
          <SpecCell
            label={t("events.tabs.specElevation")}
            value={`${fmt.number(event.elevationGain)} m`}
            className="bg-ink"
          />
          <SpecCell
            label={t("events.tabs.specAidStations")}
            value={event.aidStations.length}
            className="bg-ink"
          />
          <SpecCell
            label={t("events.tabs.specKmMarkers")}
            value={t("events.tabs.kmMarkersValue")}
            className="bg-ink"
          />
          <SpecCell
            label={t("events.tabs.specSurface")}
            value={event.surface}
            className="bg-ink"
          />
        </div>
        <div className="grid gap-0.5 border-t-2 border-line bg-line sm:grid-cols-3">
          <div className="bg-ink px-5 py-6 sm:px-7">
            <Eyebrow>{t("events.tabs.address")}</Eyebrow>
            <p className="mt-2.5 text-[15px] leading-relaxed">{event.address}</p>
          </div>
          <div className="bg-ink px-5 py-6 sm:px-7">
            <Eyebrow>{t("events.tabs.parking")}</Eyebrow>
            <p className="mt-2.5 text-[15px] leading-relaxed">{event.parking}</p>
          </div>
          <div className="bg-ink px-5 py-6 sm:px-7">
            <Eyebrow>{t("events.tabs.directions")}</Eyebrow>
            <p className="mt-2.5 text-[15px] leading-relaxed">
              {event.directions}
            </p>
          </div>
        </div>
        <div className="px-5 py-9 sm:px-8 lg:px-10">
          <Eyebrow>{t("events.tabs.aidStations")}</Eyebrow>
          <ul className="mt-4">
            {event.aidStations.map((a) => (
              <li
                key={a.label}
                className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b-2 border-line py-3.5"
              >
                <span className="w-16 font-mono text-sm text-neon-yellow">
                  {fmt.number(a.km)} km
                </span>
                <span className="text-[15px] font-semibold">{a.label}</span>
                <span className="text-[13px] text-fg-dim">
                  {a.offers.map((o) => aidOfferLabel(t, o)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </TabPanel>

      {/* ---------------------------------------------------------------- */}
      <TabPanel value="schedule" active={tab === "schedule"}>
        <div className="px-5 py-9 sm:px-8 lg:px-10">
          <ol className="border-t-2 border-line">
            {event.schedule.map((item) => (
              <li
                key={item.time + item.label}
                className="grid grid-cols-[5.5rem_1fr] items-baseline gap-4 border-b-2 border-line py-5 sm:grid-cols-[9rem_1fr]"
              >
                <span
                  className={cn(
                    "font-mono text-sm",
                    item.emphasis ? "text-neon-lime" : "text-neon-yellow",
                  )}
                >
                  {fmt.clock(item.time)}
                </span>
                <span
                  className={cn(
                    "text-base sm:text-[17px]",
                    item.emphasis ? "font-extrabold" : "font-semibold",
                  )}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </TabPanel>

      {/* ---------------------------------------------------------------- */}
      <TabPanel value="organizer" active={tab === "organizer"}>
        <div className="px-5 py-9 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-6 border-2 border-line bg-carbon p-6 sm:flex-row sm:p-8">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-gradient-to-br from-neon-yellow to-neon-lime text-2xl font-black text-ink">
              {organizer.initials}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-2xl font-black uppercase">
                  {organizer.name}
                </h3>
                {organizer.verified ? (
                  <Badge tone="green">{t("events.tabs.verified")}</Badge>
                ) : null}
              </div>
              <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-fg-dim">
                {organizer.blurb}
              </p>
              {/* A new organizer has no track record to show yet. */}
              {organizer.eventsHosted > 0 ? (
                <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                      {t("events.tabs.eventsHosted")}
                    </dt>
                    <dd className="mt-1 font-display text-lg font-black">
                      {organizer.eventsHosted}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                      {t("events.tabs.finishers")}
                    </dt>
                    <dd className="mt-1 font-display text-lg font-black">
                      {fmt.number(organizer.finishers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                      {t("events.tabs.runnerRating")}
                    </dt>
                    <dd className="mt-1 font-display text-lg font-black text-neon-lime">
                      {fmt.number(organizer.rating)}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                {/* Organizers publishing from /publish keep their email in
                    `profile_private`, so runners reach them through us. */}
                <Button
                  href={organizer.email ? `mailto:${organizer.email}` : "/contact"}
                  variant="outline"
                  size="md"
                >
                  {t("events.tabs.contactOrganizer")}
                </Button>
                {organizer.website ? (
                  <Button href="/contact" variant="ghost" size="md">
                    {organizer.website}
                  </Button>
                ) : null}
                {organizer.instagram ? (
                  <Button href="/community" variant="ghost" size="md">
                    {organizer.instagram}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </TabPanel>
    </div>
  );
}

/**
 * The organizer's own route map. Shown whole rather than cropped, since the
 * edges of a map matter; it links to the full-size file for zooming.
 */
function RouteImage({ event, src }: { event: RunningEvent; src: string }) {
  const t = useT();
  const fmt = useFormat();

  return (
    <figure className="border-b-2 border-line bg-carbon">
      <a href={src} target="_blank" rel="noopener" className="block">
        {/* A Supabase Storage URL, like the cover; see `EventCover`. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={t("events.tabs.routeImageAlt", { name: event.name })}
          loading="lazy"
          decoding="async"
          className="mx-auto max-h-[36rem] w-full object-contain"
        />
      </a>
      <figcaption className="flex flex-wrap justify-between gap-2 border-t-2 border-line px-5 py-3 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase">
        <span>
          {t("events.tabs.routeMap", { gain: fmt.number(event.elevationGain) })}
        </span>
        <span>{t("events.tabs.routeImageOpen")}</span>
      </figcaption>
    </figure>
  );
}

/** Schematic route diagram: start, finish, aid stations along a lap. */
function CourseMap({ event }: { event: RunningEvent }) {
  const t = useT();
  const fmt = useFormat();

  return (
    <div className="bg-grid-map relative h-72 overflow-hidden border-b-2 border-line bg-carbon sm:h-88">
      {/* The loop. */}
      <div className="absolute top-[62%] left-[6%] h-[3px] w-[88%] bg-neon-lime" />
      <div className="absolute top-[30%] left-[24%] h-[3px] w-[52%] bg-neon-lime" />
      <div className="absolute top-[30%] left-[24%] h-[32%] w-[3px] bg-neon-lime" />
      <div className="absolute top-[30%] left-[76%] h-[32%] w-[3px] bg-neon-lime" />

      <span className="absolute top-[62%] left-[6%] -translate-x-1/2 -translate-y-[140%] bg-neon-green px-2.5 py-1.5 text-[11px] font-black tracking-wider text-ink">
        {t("events.tabs.start")}
      </span>
      <span className="absolute top-[62%] left-[94%] -translate-x-1/2 -translate-y-[140%] bg-neon-yellow px-2.5 py-1.5 text-[11px] font-black tracking-wider text-ink">
        {t("events.tabs.finish")}
      </span>

      {event.aidStations.slice(0, 3).map((a, i) => (
        <span
          key={a.label}
          style={{ left: `${32 + i * 20}%` }}
          className="absolute top-[30%] -translate-x-1/2 -translate-y-[150%] border-2 border-fg bg-ink px-2 py-1 font-mono text-[10px] whitespace-nowrap"
        >
          {t("events.tabs.aid", { n: i + 1, km: fmt.number(a.km) })}
        </span>
      ))}

      <p className="absolute bottom-5 left-5 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase">
        {t("events.tabs.routeMap", {
          gain: fmt.number(event.elevationGain),
        })}
      </p>
    </div>
  );
}

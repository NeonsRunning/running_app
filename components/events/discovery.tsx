"use client";

import { Link } from "@/components/i18n/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Input, Radio, SegmentedControl } from "@/components/ui/field";
import { Eyebrow, StatusBadge } from "@/components/ui/badge";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { SkeletonEventCard } from "@/components/ui/skeleton";
import { useFormat, useT } from "@/components/i18n/provider";
import {
  difficultyLabel,
  distanceLabel,
  eventTypeLabel,
} from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import { TODAY } from "@/lib/data";
import type {
  Difficulty,
  Distance,
  EventType,
  RegistrationStatus,
  RunningEvent,
} from "@/lib/types";
import { EventCardCompact, EventRow } from "./event-card";

/**
 * Event discovery: search, filters, sort, and the list/map views.
 *
 * Filtering and sorting run on the client over the whole fixture set, which is
 * small enough that one pass per keystroke beats a round-trip. Every control
 * that narrows the set also resets to page 1, so results never open on a page
 * the narrowed set no longer has.
 */
const DISTANCES: Distance[] = [
  "1 Mile",
  "3K",
  "5K",
  "10K",
  "Half Marathon",
  "Marathon",
  "Ultra",
];

const TYPES: EventType[] = [
  "Road Race",
  "Trail",
  "Track",
  "Fun Run",
  "Charity Run",
  "Virtual Race",
  "Relay",
  "Kids Race",
];

const DIFFICULTIES: Difficulty[] = ["Easy", "Moderate", "Hard"];

/** Option tables carry dictionary keys; labels resolve at render. */
const STATUSES: { value: RegistrationStatus; key: string }[] = [
  { value: "open", key: "events.discovery.statusOpen" },
  { value: "opening-soon", key: "events.discovery.statusOpeningSoon" },
  { value: "almost-full", key: "events.discovery.statusAlmostFull" },
  { value: "waitlist", key: "events.discovery.statusWaitlist" },
];

const SORTS = [
  { value: "recommended", key: "events.discovery.sortRecommended" },
  { value: "soonest", key: "events.discovery.sortSoonest" },
  { value: "popular", key: "events.discovery.sortPopular" },
  { value: "distance", key: "events.discovery.sortDistance" },
  { value: "price", key: "events.discovery.sortPrice" },
] as const;

type Sort = (typeof SORTS)[number]["value"];

const DATE_WINDOWS = [
  { value: "any", key: "events.discovery.dateAny" },
  { value: "30", key: "events.discovery.date30" },
  { value: "90", key: "events.discovery.date90" },
] as const;

const PAGE_SIZE = 4;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function EventDiscovery({
  events,
  initialQuery = "",
  initialDistance,
}: {
  events: RunningEvent[];
  initialQuery?: string;
  initialDistance?: string;
}) {
  const t = useT();
  const fmt = useFormat();

  const [query, setQuery] = useState(initialQuery);
  const [distances, setDistances] = useState<Distance[]>(
    initialDistance && DISTANCES.includes(initialDistance as Distance)
      ? [initialDistance as Distance]
      : [],
  );
  const [types, setTypes] = useState<EventType[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [statuses, setStatuses] = useState<RegistrationStatus[]>([]);
  const [dateWindow, setDateWindow] = useState<string>("any");
  // 95 is the slider ceiling: at the top of the range the price filter is off,
  // which is also how `activeFilterCount` decides not to count it.
  const [maxPrice, setMaxPrice] = useState(95);
  const [sort, setSort] = useState<Sort>("recommended");
  const [view, setView] = useState<"list" | "map">("list");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = events.filter((e) => {
      if (q) {
        const haystack =
          `${e.name} ${e.city} ${e.region} ${e.type} ${e.venue}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (
        distances.length &&
        !e.categories.some((c) => distances.includes(c.name))
      ) {
        return false;
      }
      if (types.length && !types.includes(e.type)) return false;
      if (difficulties.length && !difficulties.includes(e.difficulty))
        return false;
      if (statuses.length && !statuses.includes(e.registrationStatus))
        return false;
      if (e.fromPrice > maxPrice) return false;
      if (dateWindow !== "any") {
        const days = Number(dateWindow);
        const delta =
          (new Date(`${e.date}T00:00:00`).getTime() - TODAY.getTime()) /
          86_400_000;
        if (delta > days) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "soonest":
        sorted.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case "popular":
        sorted.sort((a, b) => b.registered - a.registered);
        break;
      case "price":
        sorted.sort((a, b) => a.fromPrice - b.fromPrice);
        break;
      case "distance":
        sorted.sort(
          (a, b) =>
            Math.max(...b.categories.map((c) => c.distanceKm)) -
            Math.max(...a.categories.map((c) => c.distanceKm)),
        );
        break;
      default:
        sorted.sort((a, b) => b.popularity - a.popularity);
    }
    return sorted;
  }, [
    events,
    query,
    distances,
    types,
    difficulties,
    statuses,
    maxPrice,
    dateWindow,
    sort,
  ]);

  const activeFilterCount =
    distances.length +
    types.length +
    difficulties.length +
    statuses.length +
    (dateWindow !== "any" ? 1 : 0) +
    (maxPrice < 95 ? 1 : 0);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = results.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function clearAll() {
    setDistances([]);
    setTypes([]);
    setDifficulties([]);
    setStatuses([]);
    setDateWindow("any");
    setMaxPrice(95);
    setPage(1);
  }

  const filterPanel = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase">
          {t("events.discovery.filters")}
          {activeFilterCount > 0 ? (
            <span className="ml-2 bg-neon-lime px-1.5 py-0.5 text-ink">
              {activeFilterCount}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={clearAll}
          className="font-mono text-[11px] text-neon-lime uppercase hover:text-neon-yellow"
        >
          {t("events.discovery.clear")}
        </button>
      </div>

      <fieldset className="border-b-2 border-line px-5 py-5">
        <legend className="sr-only">{t("events.discovery.distance")}</legend>
        <Eyebrow>{t("events.discovery.distance")}</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {DISTANCES.map((d) => (
            <Chip
              key={d}
              active={distances.includes(d)}
              onClick={() => {
                setDistances((v) => toggle(v, d));
                setPage(1);
              }}
            >
              {distanceLabel(t, d)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-b-2 border-line px-5 py-5">
        <legend className="sr-only">{t("events.discovery.date")}</legend>
        <Eyebrow>{t("events.discovery.date")}</Eyebrow>
        <div className="mt-3 flex flex-col gap-3">
          {DATE_WINDOWS.map((w) => (
            <Radio
              key={w.value}
              name="date-window"
              label={t(w.key)}
              checked={dateWindow === w.value}
              onChange={() => {
                setDateWindow(w.value);
                setPage(1);
              }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="border-b-2 border-line px-5 py-5">
        <legend className="sr-only">{t("events.discovery.eventType")}</legend>
        <Eyebrow>{t("events.discovery.eventType")}</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <Chip
              key={type}
              active={types.includes(type)}
              onClick={() => {
                setTypes((v) => toggle(v, type));
                setPage(1);
              }}
            >
              {eventTypeLabel(t, type)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="border-b-2 border-line px-5 py-5">
        <label
          htmlFor="price-filter"
          className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase"
        >
          {t("events.discovery.priceUpTo", {
            max: fmt.moneyWhole(maxPrice),
          })}
        </label>
        <input
          id="price-filter"
          type="range"
          min={10}
          max={95}
          step={5}
          value={maxPrice}
          onChange={(e) => {
            setMaxPrice(Number(e.target.value));
            setPage(1);
          }}
          className="mt-4 w-full accent-[#FFF200]"
        />
      </div>

      <fieldset className="border-b-2 border-line px-5 py-5">
        <legend className="sr-only">{t("events.discovery.difficulty")}</legend>
        <Eyebrow>{t("events.discovery.difficulty")}</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              active={difficulties.includes(d)}
              onClick={() => {
                setDifficulties((v) => toggle(v, d));
                setPage(1);
              }}
            >
              {difficultyLabel(t, d)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="px-5 py-5">
        <legend className="sr-only">
          {t("events.discovery.registrationStatus")}
        </legend>
        <Eyebrow>{t("events.discovery.registration")}</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip
              key={s.value}
              active={statuses.includes(s.value)}
              onClick={() => {
                setStatuses((v) => toggle(v, s.value));
                setPage(1);
              }}
            >
              {t(s.key)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );

  return (
    <div>
      {/* Page header + search --------------------------------------------- */}
      <div className="mx-auto max-w-[1600px] px-4 pt-10 pb-6 sm:px-6 lg:px-10 lg:pt-14">
        <div className="flex flex-col gap-6 border-b-2 border-line pb-7 lg:flex-row lg:items-end">
          <h1 className="font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
            {t("events.discovery.titleLine1")}
            <br />
            {t("events.discovery.titleLine2")}
          </h1>
          <div className="flex-1" />
          <div className="flex w-full max-w-xl">
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t("events.discovery.searchPlaceholder")}
              aria-label={t("events.discovery.searchAria")}
              className="border-r-0"
            />
            <Button variant="secondary" size="lg" className="shrink-0 px-7">
              {t("events.discovery.search")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[290px_1fr]">
        {/* Sidebar filters on large screens ------------------------------- */}
        <aside className="hidden border-t-2 border-r-2 border-line lg:block">
          {filterPanel}
        </aside>

        <div className="border-t-2 border-line">
          {/* Toolbar ---------------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-4 border-b-2 border-line px-4 py-4 sm:px-6">
            <span className="font-mono text-[12px] tracking-[0.14em] text-fg-dim uppercase">
              <b className="text-fg">{fmt.number(results.length)}</b>{" "}
              {results.length === 1
                ? t("events.discovery.raceCount_one")
                : t("events.discovery.raceCount_other")}
            </span>

            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={cn(
                "border-2 px-3 py-2 text-xs font-bold tracking-wider uppercase lg:hidden",
                activeFilterCount > 0
                  ? "border-neon-lime bg-neon-lime text-ink"
                  : "border-line-strong text-fg-muted",
              )}
            >
              {t("events.discovery.filters")}
              {activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <label
                htmlFor="sort"
                className="font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase"
              >
                {t("events.discovery.sort")}
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="border-2 border-line-strong bg-carbon px-3 py-2 text-xs font-bold tracking-wider uppercase focus:border-neon-lime focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.key)}
                  </option>
                ))}
              </select>
            </div>

            <SegmentedControl
              label={t("events.discovery.resultView")}
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: t("events.discovery.viewList") },
                { value: "map", label: t("events.discovery.viewMap") },
              ]}
              className="hidden sm:flex"
            />
          </div>

          {/* Mobile filter drawer --------------------------------------- */}
          {filtersOpen ? (
            <div className="animate-rise-in border-b-2 border-line bg-carbon lg:hidden">
              {filterPanel}
              <div className="p-5">
                <Button block size="lg" onClick={() => setFiltersOpen(false)}>
                  {t("events.discovery.showResults", {
                    count: fmt.number(results.length),
                  })}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Results ---------------------------------------------------- */}
          {results.length === 0 ? (
            <div className="p-4 sm:p-8">
              <EmptyState
                icon="🔍"
                title={t("events.discovery.emptyTitle")}
                body={t("events.discovery.emptyBody")}
                action={{
                  label: t("events.discovery.clearFilters"),
                  href: "/events",
                }}
              />
            </div>
          ) : view === "map" ? (
            <MapView events={results} />
          ) : (
            <>
              <div className="hidden sm:block">
                {pageItems.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
              <div className="grid gap-4 p-4 sm:hidden">
                {pageItems.map((event) => (
                  <EventCardCompact key={event.id} event={event} />
                ))}
              </div>
              <div className="flex justify-center border-t-2 border-line px-4 py-6 sm:justify-start sm:px-6">
                <Pagination
                  page={safePage}
                  pageCount={pageCount}
                  onChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Schematic map view. Markers are positioned from each event's map coords. */
function MapView({ events }: { events: RunningEvent[] }) {
  const t = useT();
  const fmt = useFormat();
  const [active, setActive] = useState(events[0]?.id ?? "");

  return (
    <div className="grid lg:grid-cols-[1fr_400px]">
      <div className="bg-grid-map relative h-[26rem] overflow-hidden bg-carbon lg:h-[46rem]">
        {/* Coastline and highway hints. */}
        <div
          aria-hidden="true"
          className="absolute top-[22%] left-[4%] h-0.5 w-[90%] rotate-[5deg] bg-neon-lime/25"
        />
        <div
          aria-hidden="true"
          className="absolute top-[62%] left-[10%] h-0.5 w-[74%] -rotate-[8deg] bg-neon-yellow/20"
        />

        {events.map((e) => {
          const isActive = e.id === active;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setActive(e.id)}
              aria-pressed={isActive}
              style={{ left: `${e.map.x}%`, top: `${e.map.y}%` }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 border-2 px-2.5 py-1.5 text-[11px] font-black whitespace-nowrap transition-colors",
                isActive
                  ? "z-10 border-neon-yellow bg-neon-yellow text-ink"
                  : "border-neon-lime bg-ink text-neon-lime hover:bg-neon-lime hover:text-ink",
              )}
            >
              {distanceLabel(t, e.featuredDistance)} ·{" "}
              {fmt.moneyWhole(e.fromPrice)}
            </button>
          );
        })}

        <p className="absolute bottom-5 left-5 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase">
          {t("events.discovery.markers", {
            count: fmt.number(events.length),
          })}
        </p>
      </div>

      <ul className="border-t-2 border-line lg:border-t-0 lg:border-l-2">
        {events.map((e) => (
          <li
            key={e.id}
            className={cn(
              "border-b-2 border-line px-5 py-5 transition-colors",
              e.id === active && "bg-carbon",
            )}
          >
            <div className="font-mono text-[10px] tracking-[0.14em] text-neon-lime">
              {e.dow} {e.day} {e.month} ·{" "}
              {distanceLabel(t, e.featuredDistance)}
            </div>
            <h3 className="mt-2 font-display text-xl font-black uppercase">
              <Link
                href={`/events/${e.slug}`}
                className="hover:text-neon-lime"
                onFocus={() => setActive(e.id)}
              >
                {e.name}
              </Link>
            </h3>
            <div className="mt-1.5 flex items-center gap-3">
              <StatusBadge status={e.registrationStatus} label={e.statusLabel} />
              <span className="text-xs text-fg-dim">{e.city}</span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-display text-lg font-black text-neon-yellow">
                {t("events.discovery.from", {
                  price: fmt.moneyWhole(e.fromPrice),
                })}
              </span>
              <Button href={`/events/${e.slug}`} variant="outline" size="sm">
                {t("events.discovery.details")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Loading shell used by the route's `loading.tsx`. */
export function DiscoverySkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10">
      <div className="border-b-2 border-line pb-7">
        <div className="skeleton h-14 w-80" />
      </div>
      <div className="mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonEventCard key={i} />
        ))}
      </div>
    </div>
  );
}

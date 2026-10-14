"use client";

import { Link } from "@/components/i18n/link";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Chip, Input, Radio, SegmentedControl } from "@/components/ui/field";
import { Eyebrow, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { SkeletonEventCard } from "@/components/ui/skeleton";
import { useFormat, useLocale, useT } from "@/components/i18n/provider";
import {
  difficultyLabel,
  distanceLabel,
  eventTypeLabel,
} from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import {
  searchToParams,
  type EventPage,
  type EventSearch,
  type EventSort,
} from "@/lib/events/search";
import { municipalityOf, PR_MAP } from "@/lib/pr-map";
import type { Municipality } from "@/lib/pr-municipalities";
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
 * Search, filters and sort run in the database (`search_events()`), which
 * hands back 24 races a call. The first page comes with the server render;
 * the rest load from `GET /api/events` as the runner scrolls toward the end
 * of the list. Changing any control starts the list over from the top.
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
  { value: "soonest", key: "events.discovery.sortSoonest" },
  { value: "recommended", key: "events.discovery.sortRecommended" },
  { value: "popular", key: "events.discovery.sortPopular" },
  { value: "distance", key: "events.discovery.sortDistance" },
  { value: "price", key: "events.discovery.sortPrice" },
] as const satisfies readonly { value: EventSort; key: string }[];

const DATE_WINDOWS = [
  { value: "any", key: "events.discovery.dateAny" },
  { value: "30", key: "events.discovery.date30" },
  { value: "90", key: "events.discovery.date90" },
] as const;

/** How long typing has to pause before the search goes out. */
const QUERY_DEBOUNCE_MS = 300;

/** A page of results, and the search it answers. */
type Shown = EventPage & { key: string };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function EventDiscovery({
  initialSearch,
  initialPage,
}: {
  initialSearch: EventSearch;
  /** The first page of `initialSearch`, from the server render. */
  initialPage: EventPage;
}) {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();

  const [query, setQuery] = useState(initialSearch.query);
  const [settledQuery, setSettledQuery] = useState(initialSearch.query);
  const [distances, setDistances] = useState<Distance[]>(
    initialSearch.distances,
  );
  const [types, setTypes] = useState<EventType[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [statuses, setStatuses] = useState<RegistrationStatus[]>([]);
  const [dateWindow, setDateWindow] = useState<string>("any");
  // 95 is the slider ceiling: at the top of the range the price filter is off,
  // which is also how `activeFilterCount` decides not to count it.
  const [maxPrice, setMaxPrice] = useState(95);
  const [sort, setSort] = useState<EventSort>("soonest");
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const search = useMemo<EventSearch>(
    () => ({
      query: settledQuery,
      distances,
      types,
      difficulties,
      statuses,
      maxPrice: maxPrice < 95 ? maxPrice : undefined,
      withinDays: dateWindow === "any" ? undefined : Number(dateWindow),
      sort,
    }),
    [settledQuery, distances, types, difficulties, statuses, maxPrice, dateWindow, sort],
  );
  const searchKey = searchToParams(search, 0).toString();

  const [shown, setShown] = useState<Shown>(() => ({
    ...initialPage,
    key: searchToParams(initialSearch, 0).toString(),
  }));
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped by "try again" when a fresh search failed, to send it once more.
  const [attempt, setAttempt] = useState(0);
  // The search most recently sent, so a slow answer to an older one is dropped.
  const latestKey = useRef(shown.key);

  // What is on screen answers an older search while the new one loads.
  const replacing = searchKey !== shown.key && !failed;
  const results = shown.events;
  const hasMore = !replacing && results.length < shown.total;

  async function fetchPage(offset: number, signal?: AbortSignal) {
    const params = searchToParams(search, offset);
    params.set("lang", locale);
    const res = await fetch(`/api/events?${params}`, { signal });
    if (!res.ok) throw new Error(`GET /api/events: ${res.status}`);
    return (await res.json()) as EventPage;
  }

  // Typing settles before it searches; every other control applies at once.
  useEffect(() => {
    const id = setTimeout(() => setSettledQuery(query), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const startOver = useEffectEvent((signal: AbortSignal) => {
    const key = searchKey;
    latestKey.current = key;
    setFailed(false);
    fetchPage(0, signal)
      .then((page) => {
        if (latestKey.current === key) setShown({ ...page, key });
      })
      .catch(() => {
        if (!signal.aborted && latestKey.current === key) setFailed(true);
      });
  });

  useEffect(() => {
    if (searchKey === latestKey.current && attempt === 0) return;
    const controller = new AbortController();
    startOver(controller.signal);
    return () => controller.abort();
  }, [searchKey, attempt]);

  function loadMore() {
    if (loadingMore || !hasMore || failed) return;
    const key = shown.key;
    setLoadingMore(true);
    fetchPage(results.length)
      .then((page) =>
        setShown((s) => {
          if (s.key !== key) return s;
          const seen = new Set(s.events.map((e) => e.id));
          const events = [
            ...s.events,
            ...page.events.filter((e) => !seen.has(e.id)),
          ];
          // An empty page means races closed since the count; stop here.
          return {
            key,
            events,
            total: page.events.length ? page.total : events.length,
          };
        }),
      )
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  }

  function retry() {
    setFailed(false);
    if (searchKey !== shown.key) setAttempt((n) => n + 1);
  }

  // Load the next page while the end of the list is still a screen away.
  // Re-observed after each page, so a short page that leaves the sentinel in
  // view still asks for the one after it.
  const sentinel = useRef<HTMLDivElement>(null);
  const onSentinel = useEffectEvent(loadMore);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onSentinel();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, failed, results.length, view]);

  const activeFilterCount =
    distances.length +
    types.length +
    difficulties.length +
    statuses.length +
    (dateWindow !== "any" ? 1 : 0) +
    (maxPrice < 95 ? 1 : 0);

  function clearAll() {
    setDistances([]);
    setTypes([]);
    setDifficulties([]);
    setStatuses([]);
    setDateWindow("any");
    setMaxPrice(95);
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
              }}
              placeholder={t("events.discovery.searchPlaceholder")}
              aria-label={t("events.discovery.searchAria")}
              className="border-r-0"
            />
            <Button
              variant="secondary"
              size="lg"
              className="shrink-0 px-7"
              onClick={() => setSettledQuery(query)}
            >
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
              <b className="text-fg">{fmt.number(shown.total)}</b>{" "}
              {shown.total === 1
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
                onChange={(e) => setSort(e.target.value as EventSort)}
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
                    count: fmt.number(shown.total),
                  })}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Results ---------------------------------------------------- */}
          {results.length === 0 && !replacing && !failed ? (
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
          ) : (
            <div
              aria-busy={replacing || loadingMore}
              className={cn(
                "transition-opacity",
                replacing && "pointer-events-none opacity-50",
              )}
            >
              {view === "map" ? (
                <MapView events={results} />
              ) : (
                <>
                  <div className="hidden sm:block">
                    {results.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </div>
                  <div className="grid gap-4 p-4 sm:hidden">
                    {results.map((event) => (
                      <EventCardCompact key={event.id} event={event} />
                    ))}
                  </div>
                </>
              )}

              {/* Next page ------------------------------------------- */}
              <div ref={sentinel} aria-live="polite">
                {failed ? (
                  <div className="flex flex-wrap items-center gap-4 border-t-2 border-line px-4 py-6 sm:px-6">
                    <span className="text-sm text-fg-dim">
                      {t("events.discovery.loadFailed")}
                    </span>
                    <Button variant="outline" size="sm" onClick={retry}>
                      {t("events.discovery.retry")}
                    </Button>
                  </div>
                ) : loadingMore ? (
                  <div className="border-t-2 border-line px-4 py-6 font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase sm:px-6">
                    {t("events.discovery.loadingMore")}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Map view: Puerto Rico's municipalities, with a marker on each race's
 * municipality. Races in the same municipality stack beneath one another;
 * races whose city isn't a known municipality stay in the list only.
 */
function MapView({ events }: { events: RunningEvent[] }) {
  const t = useT();
  const fmt = useFormat();
  const [active, setActive] = useState(events[0]?.id ?? "");

  const markers = useMemo(() => {
    const stacks = new Map<Municipality, number>();
    return events.flatMap((event) => {
      const municipality = municipalityOf(event.city);
      if (!municipality) return [];
      const stack = stacks.get(municipality) ?? 0;
      stacks.set(municipality, stack + 1);
      return [{ event, municipality, stack }];
    });
  }, [events]);

  const hosting = new Set(markers.map((m) => m.municipality));
  const activeMunicipality = markers.find(
    (m) => m.event.id === active,
  )?.municipality;
  const shapes = Object.entries(PR_MAP.municipalities) as [
    Municipality,
    (typeof PR_MAP.municipalities)[Municipality],
  ][];

  return (
    <div className="grid lg:grid-cols-[1fr_400px]">
      <div className="bg-grid-map relative flex items-center overflow-hidden bg-carbon px-4 pt-10 pb-16 sm:px-8 lg:min-h-[46rem]">
        <div
          className="relative w-full"
          style={{ aspectRatio: `${PR_MAP.width} / ${PR_MAP.height}` }}
        >
          <svg
            viewBox={`0 0 ${PR_MAP.width} ${PR_MAP.height}`}
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            {shapes.map(([name, shape]) => (
              <path
                key={name}
                d={shape.path}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                className={cn(
                  "transition-colors",
                  name === activeMunicipality
                    ? "fill-neon-yellow/20 stroke-neon-yellow"
                    : hosting.has(name)
                      ? "fill-neon-lime/15 stroke-neon-lime/60"
                      : "fill-neon-lime/[0.04] stroke-neon-lime/25",
                )}
              >
                <title>{name}</title>
              </path>
            ))}
          </svg>

          {markers.map(({ event: e, municipality, stack }) => {
            const isActive = e.id === active;
            const { x, y } = PR_MAP.municipalities[municipality];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setActive(e.id)}
                aria-pressed={isActive}
                aria-label={`${e.name} · ${e.city}`}
                style={{
                  left: `${(x / PR_MAP.width) * 100}%`,
                  top: `${(y / PR_MAP.height) * 100}%`,
                  transform: `translate(-50%, calc(-50% + ${stack * 115}%))`,
                }}
                className={cn(
                  "absolute border-2 px-2 py-1 text-[10px] font-black whitespace-nowrap transition-colors sm:px-2.5 sm:py-1.5 sm:text-[11px]",
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
        </div>

        <p className="absolute bottom-5 left-5 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase">
          {t("events.discovery.markers", {
            count: fmt.number(markers.length),
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

import { DIFFICULTIES, DISTANCES, EVENT_TYPES, isOneOf } from "./vocabulary";
import type {
  Difficulty,
  Distance,
  EventType,
  RegistrationStatus,
  RunningEvent,
} from "@/lib/types";

/**
 * What /events asks for, shared by the page (first page, server-rendered),
 * the client (every page after) and `GET /api/events` (which answers it).
 * Safe to import from client components: no database access here.
 */

/** The most races one call returns. `search_events()` enforces it too. */
export const EVENTS_PAGE_SIZE = 24;

export const EVENT_SORTS = [
  "soonest",
  "recommended",
  "popular",
  "distance",
  "price",
] as const;
export type EventSort = (typeof EVENT_SORTS)[number];

// No "full": `search_events()` files a sold-out race under "almost-full".
const STATUSES: RegistrationStatus[] = [
  "open",
  "opening-soon",
  "almost-full",
  "closed",
];

export type EventSearch = {
  query: string;
  distances: Distance[];
  types: EventType[];
  difficulties: Difficulty[];
  statuses: RegistrationStatus[];
  /** Highest "from" price; undefined for no limit. */
  maxPrice?: number;
  /** Only races starting within this many days; undefined for any date. */
  withinDays?: number;
  sort: EventSort;
};

export type EventPage = {
  events: RunningEvent[];
  /** Races matching the search, across every page. */
  total: number;
};

export const EMPTY_SEARCH: EventSearch = {
  query: "",
  distances: [],
  types: [],
  difficulties: [],
  statuses: [],
  sort: "soonest",
};

/** The search as query-string parameters, plus the page's offset. */
export function searchToParams(
  search: EventSearch,
  offset: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (search.query.trim()) params.set("q", search.query.trim());
  for (const d of search.distances) params.append("distance", d);
  for (const t of search.types) params.append("type", t);
  for (const d of search.difficulties) params.append("difficulty", d);
  for (const s of search.statuses) params.append("status", s);
  if (search.maxPrice !== undefined)
    params.set("maxPrice", String(search.maxPrice));
  if (search.withinDays !== undefined)
    params.set("within", String(search.withinDays));
  params.set("sort", search.sort);
  if (offset > 0) params.set("offset", String(offset));
  return params;
}

/** The reverse, keeping only values the vocabulary knows. */
export function searchFromParams(params: URLSearchParams): {
  search: EventSearch;
  offset: number;
} {
  const positive = (key: string) => {
    const n = Number(params.get(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };
  const sort = params.get("sort") ?? "";

  return {
    search: {
      query: (params.get("q") ?? "").slice(0, 100),
      distances: params
        .getAll("distance")
        .filter((v) => isOneOf(DISTANCES, v)),
      types: params.getAll("type").filter((v) => isOneOf(EVENT_TYPES, v)),
      difficulties: params
        .getAll("difficulty")
        .filter((v) => isOneOf(DIFFICULTIES, v)),
      statuses: params.getAll("status").filter((v) => isOneOf(STATUSES, v)),
      maxPrice: positive("maxPrice"),
      withinDays: positive("within"),
      sort: isOneOf(EVENT_SORTS, sort) ? sort : "soonest",
    },
    offset: positive("offset") ?? 0,
  };
}

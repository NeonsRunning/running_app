import { cache } from "react";
import { getRunnerById } from "@/lib/data";
import type { Locale } from "@/lib/i18n/config";
import { formatMediumDate } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { formatFinishTime, formatPace } from "@/lib/results/evidence";
import { listRunnerResults, type RunnerResultRow } from "@/lib/results/queries";
import type { Distance, Runner } from "@/lib/types";
import { getProfile, type Profile } from "./queries";

/**
 * The view model behind `/runners/[id]`.
 *
 * Two sources feed one page. An id belonging to a real account resolves out of
 * `profiles`; the demo ids that the community screens still link to resolve out
 * of the fixtures in `lib/data.ts`. The page renders one shape either way and
 * never asks which source it came from.
 *
 * The identity half — name, city, club, bio — exists in both. For a real
 * profile the racing half comes from `race_results`: every result an
 * organizer accepted from the runner's finish evidence becomes a line of race
 * history and an achievement carrying the event's medal, and the stats and
 * personal bests are counted from them. Upcoming races are read by the page
 * itself, since only the runner may see them.
 */
export type RunnerView = {
  id: string;
  /** Still carried, for the profile's own copy — the URL no longer uses it. */
  handle: string | null;
  name: string;
  initials: string;
  /** The runner's photo; null shows the initials instead. */
  avatarUrl: string | null;
  city: string | null;
  club: string | null;
  bio: string | null;
  /** Date-only, for the "member since" line. Null for fixture runners. */
  joinedAt: string | null;
  /** Null where there is no social graph to count, rather than a zero. */
  social: { followers: number; following: number } | null;
  stats: Runner["stats"];
  personalBests: Runner["personalBests"];
  results: Runner["results"];
  achievements: Runner["achievements"];
  upcoming: Runner["upcoming"];
};

/**
 * Whether a URL segment could be an account id at all.
 *
 * `profiles.id` is a uuid, so anything else is certainly a fixture id or
 * junk. Checking the shape here keeps a hand-typed URL from costing a round
 * trip to Postgres just to be told the cast failed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The profile at an id, or null when nothing should be shown.
 *
 * Null covers "no such account" and "private profile" alike — `getProfile`
 * already collapses those two through row-level security, and the caller turns
 * both into the same 404. A visitor cannot tell a hidden profile from an
 * absent one, which is the point.
 *
 * Cached for the render pass so `generateMetadata` and the page itself share
 * one query rather than each making their own.
 */
export const getRunnerView = cache(async function getRunnerView(
  id: string,
  locale: Locale,
): Promise<RunnerView | null> {
  if (UUID.test(id)) {
    const profile = await getProfile(id);
    if (!profile) return null;
    const [results, t] = await Promise.all([
      listRunnerResults(profile.id),
      getTranslator(locale),
    ]);
    return fromProfile(profile, racing(results, locale, t));
  }

  const runner = getRunnerById(id, locale);
  return runner ? fromRunner(runner) : null;
});

/** A medal shows as new for a week after its result is accepted. */
const NEW_FOR_MS = 7 * 24 * 3600 * 1000;
/** A personal best stays highlighted for three months. */
const FRESH_FOR_MS = 90 * 24 * 3600 * 1000;

type Racing = Pick<
  RunnerView,
  "stats" | "personalBests" | "results" | "achievements"
>;

/** The racing half of a real profile, from its accepted results. */
function racing(
  rows: RunnerResultRow[],
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslator>>,
): Racing {
  const now = Date.now();

  // The fastest result at each distance is its personal best.
  const best = new Map<Distance, RunnerResultRow>();
  for (const r of rows) {
    const held = best.get(r.distance);
    if (!held || r.finishSeconds < held.finishSeconds) best.set(r.distance, r);
  }
  const bestIds = new Set([...best.values()].map((r) => r.id));

  return {
    stats: {
      races: rows.length,
      kmRaced: Math.round(rows.reduce((sum, r) => sum + r.distanceKm, 0) * 10) / 10,
      // Self-reported results carry no placings to find a podium in.
      podiums: 0,
      personalBests: best.size,
    },
    personalBests: [...best.values()].map((r) => ({
      distance: r.distance,
      time: formatFinishTime(r.finishSeconds),
      fresh: now - Date.parse(`${r.eventDate}T12:00:00Z`) < FRESH_FOR_MS,
    })),
    results: rows.map((r) => ({
      eventName: r.eventName,
      eventSlug: r.eventSlug,
      eventRemoved: r.eventRemoved,
      date: formatMediumDate(r.eventDate, locale),
      distance: r.distance,
      time: formatFinishTime(r.finishSeconds),
      pace: formatPace(r.finishSeconds, r.distanceKm),
      selfReported: true,
      personalBest: bestIds.has(r.id),
      podium: false,
    })),
    achievements: rows.map((r) => ({
      id: r.id,
      emoji: "🏅",
      name: r.eventName,
      detail: t("runner.medalDetail", {
        distance: distanceLabel(t, r.distance),
        date: formatMediumDate(r.eventDate, locale),
      }),
      earned: true,
      earnedOn: r.eventDate,
      isNew: r.reviewedAt ? now - Date.parse(r.reviewedAt) < NEW_FOR_MS : false,
      image: r.medalImage,
    })),
  };
}

function fromProfile(profile: Profile, racing: Racing): RunnerView {
  return {
    id: profile.id,
    handle: profile.handle,
    name: profile.name,
    initials: profile.initials,
    avatarUrl: profile.avatarUrl,
    city: profile.city,
    club: profile.club,
    bio: profile.bio,
    // `created_at` is a timestamptz; the formatters take a plain date.
    joinedAt: profile.joinedAt.slice(0, 10),
    social: null,
    ...racing,
    upcoming: [],
  };
}

function fromRunner(runner: Runner): RunnerView {
  return {
    id: runner.id,
    handle: runner.handle,
    name: runner.name,
    initials: runner.initials,
    avatarUrl: null,
    city: runner.city,
    club: runner.club,
    bio: runner.bio,
    joinedAt: null,
    social: { followers: runner.followers, following: runner.following },
    stats: runner.stats,
    personalBests: runner.personalBests,
    results: runner.results,
    achievements: runner.achievements,
    upcoming: runner.upcoming,
  };
}

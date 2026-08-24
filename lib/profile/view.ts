import { cache } from "react";
import { getRunnerById } from "@/lib/data";
import type { Locale } from "@/lib/i18n/config";
import type { Runner } from "@/lib/types";
import { getProfile, type Profile } from "./queries";

/**
 * The view model behind `/runners/[id]`.
 *
 * Two sources feed one page. An id belonging to a real account resolves out of
 * `profiles`; the demo ids that the community screens still link to resolve out
 * of the fixtures in `lib/data.ts`. The page renders one shape either way and
 * never asks which source it came from.
 *
 * The identity half — name, city, club, bio — exists in both. The racing half
 * — stats, achievements, results, upcoming — has no table behind it yet, so a
 * real profile carries it empty and the page shows empty states rather than
 * borrowing someone else's numbers.
 */
export type RunnerView = {
  id: string;
  /** Still carried, for the profile's own copy — the URL no longer uses it. */
  handle: string | null;
  name: string;
  initials: string;
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

const NO_STATS: Runner["stats"] = {
  races: 0,
  kmRaced: 0,
  podiums: 0,
  personalBests: 0,
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
    return profile ? fromProfile(profile) : null;
  }

  const runner = getRunnerById(id, locale);
  return runner ? fromRunner(runner) : null;
});

function fromProfile(profile: Profile): RunnerView {
  return {
    id: profile.id,
    handle: profile.handle,
    name: profile.name,
    initials: profile.initials,
    city: profile.city,
    club: profile.club,
    bio: profile.bio,
    // `created_at` is a timestamptz; the formatters take a plain date.
    joinedAt: profile.joinedAt.slice(0, 10),
    social: null,
    stats: NO_STATS,
    personalBests: [],
    results: [],
    achievements: [],
    upcoming: [],
  };
}

function fromRunner(runner: Runner): RunnerView {
  return {
    id: runner.id,
    handle: runner.handle,
    name: runner.name,
    initials: runner.initials,
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

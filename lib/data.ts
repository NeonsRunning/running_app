import type {
  AppNotification,
  Runner,
} from "./types";
import type { Locale } from "./i18n/config";
import { SELF_PROFILE_PATH } from "./auth/routes";
import { daysBetween, puertoRicoToday } from "./dates";
import {
  ACHIEVEMENT_EARNED_ON_ES,
  ACHIEVEMENT_ES,
  CLUB_FOCUS_ES,
  COMMUNITY_FEED_ES,
  NOTIFICATION_ES,
  RUNNER_BIO_ES,
  localizeDateStamp,
} from "./content/fixtures.es";

/**
 * In-memory fixtures. Everything the UI reads flows through the accessors at the
 * bottom of this file, so swapping in a real API later is a one-layer change.
 */

export const RUNNERS: Runner[] = [
  {
    id: "alex-rivera",
    handle: "alex-rivera",
    name: "Alex Rivera",
    initials: "AR",
    city: "San Juan, Puerto Rico",
    club: "Neons Nocturnos",
    bio: "Night-race specialist. Chasing a sub-45 10K before the year ends. Coffee at 4:30 AM, out the door at 5.",
    followers: 418,
    following: 132,
    stats: { races: 12, kmRaced: 78.4, podiums: 3, personalBests: 4 },
    personalBests: [
      { distance: "5K", time: "24:38", fresh: true },
      { distance: "10K", time: "51:04", fresh: true },
      { distance: "Half Marathon", time: "1:58:22", fresh: false },
    ],
    results: [
      {
        eventName: "Neon Night 5K",
        eventSlug: "neon-night-10k",
        date: "12 JUL 2026",
        distance: "5K",
        time: "24:38",
        pace: "4:55 / km",
        placings: {
          overallPlace: 42,
          overallField: 528,
          genderPlace: 34,
          genderField: 281,
          agePlace: 8,
          ageField: 74,
        },
        personalBest: true,
        podium: false,
      },
      {
        eventName: "Condado Coastal 10K",
        eventSlug: "condado-coastal-10k",
        date: "24 MAY 2026",
        distance: "10K",
        time: "51:04",
        pace: "5:06 / km",
        placings: {
          overallPlace: 88,
          overallField: 612,
          genderPlace: 71,
          genderField: 340,
          agePlace: 14,
          ageField: 96,
        },
        personalBest: true,
        podium: false,
      },
      {
        eventName: "Luquillo Beach 5K",
        eventSlug: "luquillo-beach-fun-run",
        date: "08 MAR 2026",
        distance: "5K",
        time: "25:12",
        pace: "5:02 / km",
        placings: {
          overallPlace: 3,
          overallField: 214,
          genderPlace: 3,
          genderField: 118,
          agePlace: 1,
          ageField: 38,
        },
        personalBest: false,
        podium: true,
      },
      {
        eventName: "Old San Juan Half",
        eventSlug: "neon-night-10k",
        date: "16 NOV 2025",
        distance: "Half Marathon",
        time: "1:58:22",
        pace: "5:36 / km",
        placings: {
          overallPlace: 204,
          overallField: 741,
          genderPlace: 168,
          genderField: 402,
          agePlace: 31,
          ageField: 118,
        },
        personalBest: true,
        podium: false,
      },
    ],
    achievements: [
      { id: "first-5k", emoji: "🏅", name: "First 5K", detail: "Mar 2025", earned: true, earnedOn: "Mar 2025" },
      { id: "streak", emoji: "🔥", name: "5 Race Streak", detail: "Jul 2025", earned: true, earnedOn: "Jul 2025" },
      { id: "sub25", emoji: "⚡", name: "Sub-25 5K", detail: "New · Aug 2026", earned: true, earnedOn: "Aug 2026", isNew: true },
      { id: "100km", emoji: "🏃", name: "100 KM Club", detail: "21.6 km to go", earned: false },
      { id: "night", emoji: "🌙", name: "Night Runner", detail: "6 night races", earned: true, earnedOn: "Jun 2026" },
      { id: "podium", emoji: "🏆", name: "Podium Finish", detail: "3rd · Luquillo 5K", earned: true, earnedOn: "Mar 2026" },
    ],
    upcoming: [
      { eventSlug: "neon-night-10k", bib: "1048", category: "10K", wave: "Wave A" },
      { eventSlug: "el-yunque-trail-half", bib: "—", category: "Half Marathon", wave: "Wave A" },
      { eventSlug: "luquillo-beach-fun-run", bib: "—", category: "3K", wave: "Open" },
    ],
  },
];

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: "n1",
    kind: "reminder",
    title: "Race reminder",
    body: "Your Neon Night 10K starts in 3 days. Bib pickup opens Friday at the expo.",
    time: "2h ago",
    unread: true,
    href: "/events/neon-night-10k",
  },
  {
    id: "n2",
    kind: "update",
    title: "Event update",
    body: "Neon Night 10K: the start village moved one block west, to Paseo de la Princesa gate 2.",
    time: "Yesterday",
    unread: true,
    href: "/events/neon-night-10k",
  },
  {
    id: "n3",
    kind: "confirmed",
    title: "Registration confirmed",
    body: "You are officially registered for Neon Night 10K. Bib #1048, Wave A.",
    time: "12 Aug",
    unread: true,
    href: SELF_PROFILE_PATH,
  },
  {
    id: "n4",
    kind: "results",
    title: "Race results available",
    body: "Your official Condado Coastal 10K result has been posted: 51:04, a new personal best.",
    time: "25 May",
    unread: false,
    href: "/events/condado-coastal-10k/results",
  },
  {
    id: "n5",
    kind: "social",
    title: "Marisol Rivera followed you",
    body: "You now have 418 followers on NEONS RUNNING.",
    time: "20 May",
    unread: false,
    href: "/runners/alex-rivera",
  },
];

export const CLUBS = [
  { id: "nocturnos", name: "Neons Nocturnos", city: "San Juan", members: 184, focus: "Night road running", initials: "NN" },
  { id: "costa", name: "Costa Norte RC", city: "Dorado", members: 96, focus: "Beach and seawall", initials: "CN" },
  { id: "yunque", name: "Yunque Trail Crew", city: "Río Grande", members: 62, focus: "Technical trail", initials: "YC" },
  { id: "sur", name: "Ponce Track Club", city: "Ponce", members: 141, focus: "Track and speed work", initials: "PT" },
];

export const COMMUNITY_FEED = [
  { id: "f1", initials: "MC", name: "María Colón", text: "completed her first half marathon at Old San Juan Half.", time: "3h ago", tone: "lime" as const },
  { id: "f2", initials: "CR", name: "Carlos Reyes", text: "set a new 5K personal best: 21:42.", time: "6h ago", tone: "yellow" as const },
  { id: "f3", initials: "KS", name: "Keila Santana", text: "took 2nd overall at Condado Coastal 10K.", time: "Yesterday", tone: "green" as const },
  { id: "f4", initials: "NV", name: "Néstor Vega", text: "joined Neons Nocturnos and logged a 6th night race.", time: "2d ago", tone: "lime" as const },
];

/* ------------------------------------------------------------------ */
/* Accessors                                                          */
/* ------------------------------------------------------------------ */

function localizeRunner(runner: Runner, locale: Locale): Runner {
  if (locale !== "es") return runner;

  return {
    ...runner,
    bio: RUNNER_BIO_ES[runner.handle] ?? runner.bio,
    results: runner.results.map((result) => ({
      ...result,
      date: localizeDateStamp(result.date),
    })),
    achievements: runner.achievements.map((achievement) => {
      const copy = ACHIEVEMENT_ES[achievement.id];
      const earnedOn = ACHIEVEMENT_EARNED_ON_ES[achievement.id];
      return {
        ...achievement,
        ...(copy ?? {}),
        ...(achievement.earnedOn && earnedOn ? { earnedOn } : {}),
      };
    }),
  };
}

export function getRunnerById(id: string, locale: Locale): Runner | undefined {
  const runner = RUNNERS.find((r) => r.id === id);
  return runner && localizeRunner(runner, locale);
}

export function currentRunner(locale: Locale): Runner {
  return localizeRunner(RUNNERS[0], locale);
}

export function getNotifications(locale: Locale): AppNotification[] {
  if (locale !== "es") return NOTIFICATIONS;
  return NOTIFICATIONS.map((n) => ({ ...n, ...(NOTIFICATION_ES[n.id] ?? {}) }));
}

export function getClubs(locale: Locale) {
  if (locale !== "es") return CLUBS;
  return CLUBS.map((c) => ({ ...c, focus: CLUB_FOCUS_ES[c.id] ?? c.focus }));
}

export function getCommunityFeed(locale: Locale) {
  if (locale !== "es") return COMMUNITY_FEED;
  return COMMUNITY_FEED.map((item) => ({
    ...item,
    ...(COMMUNITY_FEED_ES[item.id] ?? {}),
  }));
}

/**
 * Whole days from today on the island to the event: 0 on race day, 1 the day
 * before. Server-rendered only, so the clock is read once per request and
 * there is no client render to disagree with.
 */
export function daysUntil(isoDate: string, from: Date = new Date()): number {
  return Math.max(0, daysBetween(puertoRicoToday(from), isoDate));
}

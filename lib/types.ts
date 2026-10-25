/** Domain types for the NEONS RUNNING platform. */

import type { AthMovilAccount } from "@/lib/ath-movil/config";

export type EventType =
  | "Road Race"
  | "Trail"
  | "Track"
  | "Fun Run"
  | "Charity Run"
  | "Virtual Race"
  | "Relay"
  | "Kids Race";

export type Distance =
  | "1 Mile"
  | "3K"
  | "5K"
  | "10K"
  | "Half Marathon"
  | "Marathon"
  | "Ultra";

export type Difficulty = "Easy" | "Moderate" | "Hard";

export type RegistrationStatus =
  | "open"
  | "opening-soon"
  | "almost-full"
  | "closed";

export type RaceCategory = {
  id: string;
  name: Distance;
  distanceKm: number;
  price: number;
  /** Absent when the race has no start time; see `startTimeLabel`. */
  startTime?: string;
  wave: string;
  capacity: number;
  registered: number;
};

export type AidStation = {
  km: number;
  label: string;
  offers: string[];
};

export type ScheduleItem = {
  time: string;
  label: string;
  emphasis?: boolean;
};

export type Organizer = {
  id: string;
  name: string;
  initials: string;
  verified: boolean;
  since: number;
  eventsHosted: number;
  finishers: number;
  rating: number;
  website: string;
  instagram: string;
  email: string;
  blurb: string;
};

export type RunningEvent = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string[];
  type: EventType;
  /** Cover image URL; absent for races without one, which get the gradient. */
  image?: string;
  /** Route map image URL; absent when the Route tab shows the schematic. */
  routeImage?: string;
  /** Finisher medal image URL; absent when the page shows the placeholder. */
  medalImage?: string;
  /** Runners take part anywhere in the region; city and venue then say so. */
  anywhere: boolean;
  city: string;
  region: string;
  /** "City, Region", or "Anywhere in Region" for a race run anywhere. */
  place: string;
  venue: string;
  address: string;
  date: string; // ISO date
  dow: string;
  day: string;
  month: string;
  year: string;
  /** Last day of a multi-day race, ISO; absent for a one-day one. */
  endDate?: string;
  /** The last day, split like `dow`/`day`/`month`; absent for a one-day race. */
  end?: { dow: string; day: string; month: string };
  /** Absent when runners start any time across the dates, or it is not announced. */
  startTime?: string;
  registrationCloses: string;
  /** Formatted like `registrationCloses`; absent when sign-ups open on publish. */
  registrationOpens?: string;
  registrationStatus: RegistrationStatus;
  statusLabel: string;
  difficulty: Difficulty;
  terrain: string;
  surface: string;
  elevationGain: number;
  cutoff: string;
  minimumAge: number;
  categories: RaceCategory[];
  featuredDistance: Distance;
  fromPrice: number;
  registered: number;
  capacity: number;
  organizerId: string;
  included: { icon: IncludedIcon; label: string; detail: string }[];
  schedule: ScheduleItem[];
  aidStations: AidStation[];
  parking: string;
  directions: string;
  popularity: number;
  /**
   * True for races published from /publish, whose registration writes to the
   * database. Fixture races keep the demo flow.
   */
  bookable?: boolean;
  /** Sizes the organizer offers; set on bookable races only. */
  shirtSizes?: string[];
  /** What the organizer offers at sign-up; set on bookable races only. */
  extras?: EventExtras;
  /**
   * The ATH Móvil Business account runners pay into; absent when the race
   * does not take ATH Móvil, or its account was retired.
   */
  athMovil?: AthMovilAccount;
  /** Runners may send finish evidence after race day; set on bookable races. */
  acceptsResults?: boolean;
  /** Finishers get the medal mailed, so sign-up asks for an address. */
  mailsMedals?: boolean;
};

/** Add-ons a runner can pick at sign-up. Null means not on offer. */
export type EventExtras = {
  shirtPrice: number | null;
  photoPrice: number | null;
  /** Who receives donations. */
  donationRecipient: string | null;
  /** Shipping and handling when the runner has their kit sent by mail. */
  shippingPrice: number | null;
};

export type IncludedIcon =
  | "bib"
  | "chip"
  | "medal"
  | "shirt"
  | "hydration"
  | "photos";

export type RaceResult = {
  eventName: string;
  eventSlug: string;
  /** Taken down by a platform admin: there is no event page to link to. */
  eventRemoved?: boolean;
  date: string;
  distance: Distance;
  time: string;
  pace: string;
  /**
   * Placings come from official timing. A result the runner reported with
   * finish evidence has none, and the profile leaves those cells out.
   */
  placings?: {
    overallPlace: number;
    overallField: number;
    genderPlace: number;
    genderField: number;
    agePlace: number;
    ageField: number;
  };
  /** Accepted from the runner's own finish evidence rather than timing. */
  selfReported?: boolean;
  personalBest: boolean;
  podium: boolean;
};

export type Achievement = {
  id: string;
  emoji: string;
  name: string;
  detail: string;
  earned: boolean;
  earnedOn?: string;
  isNew?: boolean;
  /** The event's finisher medal, shown in place of the emoji. */
  image?: string;
};

export type Runner = {
  id: string;
  handle: string;
  name: string;
  initials: string;
  city: string;
  club: string;
  bio: string;
  followers: number;
  following: number;
  stats: {
    races: number;
    kmRaced: number;
    podiums: number;
    personalBests: number;
  };
  personalBests: { distance: Distance; time: string; fresh: boolean }[];
  results: RaceResult[];
  achievements: Achievement[];
  upcoming: {
    eventSlug: string;
    bib: string;
    category: Distance;
    wave: string;
    /** Signed up but not paid yet: there is no bib until it is. */
    pending?: boolean;
  }[];
};

export type AppNotification = {
  id: string;
  kind: "reminder" | "confirmed" | "results" | "update" | "social";
  title: string;
  body: string;
  time: string;
  unread: boolean;
  href: string;
};

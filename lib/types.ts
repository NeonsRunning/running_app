/** Domain types for the NEONS RUNNING platform. */

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
  | "waitlist"
  | "closed";

export type RaceCategory = {
  id: string;
  name: Distance;
  distanceKm: number;
  price: number;
  startTime: string;
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
  city: string;
  region: string;
  venue: string;
  address: string;
  /** Percentage coordinates used to place markers on the schematic map. */
  map: { x: number; y: number };
  date: string; // ISO date
  dow: string;
  day: string;
  month: string;
  year: string;
  startTime: string;
  registrationCloses: string;
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
  date: string;
  distance: Distance;
  time: string;
  pace: string;
  overallPlace: number;
  overallField: number;
  genderPlace: number;
  genderField: number;
  agePlace: number;
  ageField: number;
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
  upcoming: { eventSlug: string; bib: string; category: Distance; wave: string }[];
};

export type Participant = {
  bib: string;
  name: string;
  initials: string;
  age: number;
  gender: "M" | "F" | "X";
  distance: Distance;
  shirt: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  registeredOn: string;
  paid: boolean;
  checkedIn: boolean;
  email: string;
};

export type LeaderboardRow = {
  place: number;
  name: string;
  handle?: string;
  bib: string;
  time: string;
  pace: string;
  gender: "M" | "F";
  ageGroup: string;
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

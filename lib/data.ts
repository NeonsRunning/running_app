import type {
  AppNotification,
  LeaderboardRow,
  Organizer,
  Participant,
  Runner,
  RunningEvent,
} from "./types";
import type { Locale } from "./i18n/config";
import { formatMonthShort, formatWeekdayShort } from "./i18n/format";
import { EVENT_COPY_ES } from "./content/events.es";
import {
  ACHIEVEMENT_EARNED_ON_ES,
  ACHIEVEMENT_ES,
  CLUB_FOCUS_ES,
  COMMUNITY_FEED_ES,
  NOTIFICATION_ES,
  ORGANIZER_BLURB_ES,
  RUNNER_BIO_ES,
  localizeDateStamp,
} from "./content/fixtures.es";

/**
 * In-memory fixtures. Everything the UI reads flows through the accessors at the
 * bottom of this file, so swapping in a real API later is a one-layer change.
 */

export const ORGANIZERS: Organizer[] = [
  {
    id: "neons-pr",
    name: "Neons Running PR",
    initials: "NR",
    verified: true,
    since: 2019,
    eventsHosted: 41,
    finishers: 26410,
    rating: 4.9,
    website: "neonsrunning.pr",
    instagram: "@neonsrunning",
    email: "hola@neonsrunning.pr",
    blurb:
      "Organizing night races across the island since 2019. Closed courses, chip timing on every distance, and a start line that feels like a block party.",
  },
  {
    id: "yunque-trails",
    name: "Yunque Trail Collective",
    initials: "YT",
    verified: true,
    since: 2021,
    eventsHosted: 12,
    finishers: 3980,
    rating: 4.8,
    website: "yunquetrails.org",
    instagram: "@yunquetrails",
    email: "info@yunquetrails.org",
    blurb:
      "Rainforest and ridge-line racing in the north-east. Small fields, big vertical, and a rule that every runner is off the mountain before dark.",
  },
  {
    id: "costa-club",
    name: "Costa Norte Running Club",
    initials: "CN",
    verified: false,
    since: 2016,
    eventsHosted: 28,
    finishers: 14200,
    rating: 4.6,
    website: "costanorterun.com",
    instagram: "@costanorterun",
    email: "carreras@costanorterun.com",
    blurb:
      "A community club turned race series. Beach starts, family waves, and proceeds that stay on the north coast.",
  },
];

const INCLUDED_STANDARD: RunningEvent["included"] = [
  { icon: "bib", label: "Race bib", detail: "Personalized, pre-cut" },
  { icon: "chip", label: "Timing chip", detail: "Disposable, in-bib" },
  { icon: "medal", label: "Finisher medal", detail: "Glow-in-the-dark" },
  { icon: "shirt", label: "Event shirt", detail: "Technical, XS–XXL" },
  { icon: "hydration", label: "Hydration", detail: "4 stations on course" },
  { icon: "photos", label: "Digital photos", detail: "Free, unwatermarked" },
];

export const EVENTS: RunningEvent[] = [
  {
    id: "nn10k",
    slug: "neon-night-10k",
    name: "Neon Night 10K",
    tagline: "Ten kilometers of closed road through Old San Juan, after dark.",
    description: [
      "Neon Night 10K takes over the Paseo de la Princesa and the old city walls after sunset. Ten kilometers of closed, flat road lit end to end — glow arches at every kilometer, a live percussion section at the halfway turn, and a finish line under the fort.",
      "Chip-timed on a certified course with a 1:45 cutoff. Bib pickup opens Friday at the expo, or race day from 4:00 PM at the start village.",
    ],
    type: "Road Race",
    city: "San Juan",
    region: "Puerto Rico",
    venue: "Paseo de la Princesa",
    address: "Paseo de la Princesa, Old San Juan, PR 00901",
    map: { x: 34, y: 38 },
    date: "2026-09-12",
    dow: "SAT",
    day: "12",
    month: "SEP",
    year: "2026",
    startTime: "6:00 PM",
    registrationCloses: "September 9",
    registrationStatus: "open",
    statusLabel: "Registration open",
    difficulty: "Moderate",
    terrain: "Closed asphalt, flat",
    surface: "100% road",
    elevationGain: 42,
    cutoff: "1:45:00",
    minimumAge: 14,
    featuredDistance: "10K",
    fromPrice: 30,
    registered: 342,
    capacity: 500,
    organizerId: "neons-pr",
    popularity: 96,
    categories: [
      { id: "5k", name: "5K", distanceKm: 5, price: 30, startTime: "6:10 PM", wave: "Wave B", capacity: 200, registered: 148 },
      { id: "10k", name: "10K", distanceKm: 10, price: 40, startTime: "6:00 PM", wave: "Wave A", capacity: 500, registered: 342 },
      { id: "half", name: "Half Marathon", distanceKm: 21.1, price: 65, startTime: "5:30 PM", wave: "Wave A", capacity: 150, registered: 96 },
    ],
    included: INCLUDED_STANDARD,
    schedule: [
      { time: "4:00 PM", label: "Check-in and bib pickup opens" },
      { time: "5:15 PM", label: "Group warm-up at the Paseo stage" },
      { time: "5:30 PM", label: "Race start · Half marathon" },
      { time: "6:00 PM", label: "Race start · 10K wave A", emphasis: true },
      { time: "6:10 PM", label: "Race start · 5K wave B" },
      { time: "7:45 PM", label: "Awards ceremony" },
      { time: "8:30 PM", label: "Course closes" },
    ],
    aidStations: [
      { km: 3, label: "Aid 1 · La Puntilla", offers: ["Water", "Electrolyte"] },
      { km: 6, label: "Aid 2 · Ballajá", offers: ["Water", "Electrolyte", "Gels"] },
      { km: 8, label: "Aid 3 · Del Morro", offers: ["Water"] },
      { km: 10, label: "Finish · Fort lawn", offers: ["Water", "Fruit", "Coconut"] },
    ],
    parking: "Covadonga garage, $5 flat · 8 min walk to start",
    directions: "Free shuttle from Sagrado station, 5:00–5:45 PM",
  },
  {
    id: "cc10k",
    slug: "condado-coastal-10k",
    name: "Condado Coastal 10K",
    tagline: "Sunrise along the seawall, flat and fast the whole way.",
    description: [
      "A point-to-point ten kilometers that hugs the Condado seawall from Ventana al Mar to Ocean Park and back. The flattest certified course on the island, and the one where most of our runners set their 10K personal best.",
      "Early start to beat the heat. Water every 2.5 km and a shaded recovery zone at the finish.",
    ],
    type: "Road Race",
    city: "Condado",
    region: "Puerto Rico",
    venue: "Ventana al Mar",
    address: "Av. Ashford, Condado, San Juan, PR 00907",
    map: { x: 52, y: 30 },
    date: "2026-09-27",
    dow: "SUN",
    day: "27",
    month: "SEP",
    year: "2026",
    startTime: "6:00 AM",
    registrationCloses: "September 24",
    registrationStatus: "almost-full",
    statusLabel: "12 spots left",
    difficulty: "Easy",
    terrain: "Flat coastal road",
    surface: "100% road",
    elevationGain: 18,
    cutoff: "1:30:00",
    minimumAge: 12,
    featuredDistance: "10K",
    fromPrice: 25,
    registered: 518,
    capacity: 530,
    organizerId: "costa-club",
    popularity: 91,
    categories: [
      { id: "5k", name: "5K", distanceKm: 5, price: 25, startTime: "6:15 AM", wave: "Wave B", capacity: 250, registered: 244 },
      { id: "10k", name: "10K", distanceKm: 10, price: 40, startTime: "6:00 AM", wave: "Wave A", capacity: 280, registered: 274 },
    ],
    included: INCLUDED_STANDARD,
    schedule: [
      { time: "4:45 AM", label: "Check-in and bib pickup opens" },
      { time: "5:40 AM", label: "Group warm-up at Ventana al Mar" },
      { time: "6:00 AM", label: "Race start · 10K", emphasis: true },
      { time: "6:15 AM", label: "Race start · 5K" },
      { time: "7:30 AM", label: "Awards ceremony" },
    ],
    aidStations: [
      { km: 2.5, label: "Aid 1 · Ocean Park", offers: ["Water"] },
      { km: 5, label: "Aid 2 · Turnaround", offers: ["Water", "Electrolyte"] },
      { km: 7.5, label: "Aid 3 · Ashford", offers: ["Water"] },
    ],
    parking: "Street parking on Ashford · arrive before 5:15 AM",
    directions: "The T5 bus stops two blocks from the start village",
  },
  {
    id: "eyth",
    slug: "el-yunque-trail-half",
    name: "El Yunque Trail Half",
    tagline: "Twenty-one kilometers of rainforest single-track and fire road.",
    description: [
      "The toughest half on the island. You climb 780 meters through closed rainforest trail, cross three river fords, and finish on the ridge with the whole north coast behind you.",
      "Mandatory kit check at bib pickup: 500 ml of carried water, a whistle, and a phone. The field is capped at 240 runners to protect the trail.",
    ],
    type: "Trail",
    city: "Río Grande",
    region: "Puerto Rico",
    venue: "El Portal Visitor Center",
    address: "PR-191 km 4.3, Río Grande, PR 00745",
    map: { x: 70, y: 52 },
    date: "2026-10-10",
    dow: "SAT",
    day: "10",
    month: "OCT",
    year: "2026",
    startTime: "5:30 AM",
    registrationCloses: "October 3",
    registrationStatus: "open",
    statusLabel: "Registration open",
    difficulty: "Hard",
    terrain: "Single-track, river crossings",
    surface: "70% trail · 30% fire road",
    elevationGain: 780,
    cutoff: "4:30:00",
    minimumAge: 18,
    featuredDistance: "Half Marathon",
    fromPrice: 45,
    registered: 204,
    capacity: 240,
    organizerId: "yunque-trails",
    popularity: 84,
    categories: [
      { id: "10k", name: "10K", distanceKm: 10, price: 45, startTime: "6:00 AM", wave: "Wave B", capacity: 90, registered: 78 },
      { id: "half", name: "Half Marathon", distanceKm: 21.1, price: 65, startTime: "5:30 AM", wave: "Wave A", capacity: 150, registered: 126 },
    ],
    included: [
      { icon: "bib", label: "Race bib", detail: "Waterproof, trail stock" },
      { icon: "chip", label: "Timing chip", detail: "Ankle strap, returned" },
      { icon: "medal", label: "Finisher medal", detail: "Carved tabonuco wood" },
      { icon: "shirt", label: "Event shirt", detail: "Merino blend, XS–XXL" },
      { icon: "hydration", label: "Hydration", detail: "3 stations, cupless" },
      { icon: "photos", label: "Digital photos", detail: "Free, unwatermarked" },
    ],
    schedule: [
      { time: "4:15 AM", label: "Check-in, kit check and bib pickup" },
      { time: "5:15 AM", label: "Mandatory trail briefing" },
      { time: "5:30 AM", label: "Race start · Half marathon", emphasis: true },
      { time: "6:00 AM", label: "Race start · 10K" },
      { time: "10:00 AM", label: "Awards and closing" },
    ],
    aidStations: [
      { km: 5, label: "Aid 1 · Juan Diego", offers: ["Water", "Electrolyte"] },
      { km: 11, label: "Aid 2 · Ridge", offers: ["Water", "Gels", "Fruit"] },
      { km: 17, label: "Aid 3 · Last ford", offers: ["Water", "Cola"] },
    ],
    parking: "El Portal lot, free · fills by 4:30 AM",
    directions: "Shuttle from Río Grande plaza, 3:45–4:45 AM",
  },
  {
    id: "vsm",
    slug: "vieques-sunrise-marathon",
    name: "Vieques Sunrise Marathon",
    tagline: "A full marathon on an island with more horses than cars.",
    description: [
      "Forty-two kilometers around Vieques, starting in the dark at Esperanza and finishing on the sand at Sun Bay. Rolling coastal road, almost no traffic, and a sunrise at kilometer eight that runners talk about for years.",
      "Entry includes the ferry crossing from Ceiba on race weekend. The field is capped at 200.",
    ],
    type: "Road Race",
    city: "Vieques",
    region: "Puerto Rico",
    venue: "Malecón de Esperanza",
    address: "Calle Flamboyán, Esperanza, Vieques, PR 00765",
    map: { x: 84, y: 66 },
    date: "2026-11-08",
    dow: "SUN",
    day: "08",
    month: "NOV",
    year: "2026",
    startTime: "5:00 AM",
    registrationCloses: "October 25",
    registrationStatus: "open",
    statusLabel: "Early bird",
    difficulty: "Hard",
    terrain: "Rolling coastal road",
    surface: "100% road",
    elevationGain: 310,
    cutoff: "6:30:00",
    minimumAge: 18,
    featuredDistance: "Marathon",
    fromPrice: 60,
    registered: 96,
    capacity: 200,
    organizerId: "neons-pr",
    popularity: 72,
    categories: [
      { id: "half", name: "Half Marathon", distanceKm: 21.1, price: 60, startTime: "5:30 AM", wave: "Wave B", capacity: 100, registered: 54 },
      { id: "marathon", name: "Marathon", distanceKm: 42.2, price: 95, startTime: "5:00 AM", wave: "Wave A", capacity: 100, registered: 42 },
    ],
    included: INCLUDED_STANDARD,
    schedule: [
      { time: "3:30 AM", label: "Check-in opens on the Malecón" },
      { time: "4:40 AM", label: "Race briefing" },
      { time: "5:00 AM", label: "Race start · Marathon", emphasis: true },
      { time: "5:30 AM", label: "Race start · Half marathon" },
      { time: "11:30 AM", label: "Awards on the sand" },
    ],
    aidStations: [
      { km: 7, label: "Aid 1 · Mosquito Pier", offers: ["Water", "Electrolyte"] },
      { km: 14, label: "Aid 2 · Isabel II", offers: ["Water", "Gels"] },
      { km: 21, label: "Aid 3 · Half split", offers: ["Water", "Gels", "Fruit"] },
      { km: 30, label: "Aid 4 · La Chata", offers: ["Water", "Cola", "Salt"] },
      { km: 37, label: "Aid 5 · Sun Bay gate", offers: ["Water", "Ice"] },
    ],
    parking: "Leave the car in Ceiba — the ferry is included with entry",
    directions: "Race ferry departs Ceiba 6:00 PM Saturday",
  },
  {
    id: "lbfr",
    slug: "luquillo-beach-fun-run",
    name: "Luquillo Beach Fun Run",
    tagline: "Three kilometers on the sand. Strollers, dogs and kids welcome.",
    description: [
      "The least serious race we run, and the biggest. Three kilometers along Balneario Monserrate at low tide, untimed, with a kids mile that starts fifteen minutes earlier.",
      "Every entry funds a season of youth track at the Luquillo municipal club.",
    ],
    type: "Fun Run",
    city: "Luquillo",
    region: "Puerto Rico",
    venue: "Balneario Monserrate",
    address: "PR-3 km 35.4, Luquillo, PR 00773",
    map: { x: 64, y: 42 },
    date: "2026-11-21",
    dow: "SAT",
    day: "21",
    month: "NOV",
    year: "2026",
    startTime: "7:00 AM",
    registrationCloses: "November 19",
    registrationStatus: "open",
    statusLabel: "Registration open",
    difficulty: "Easy",
    terrain: "Packed sand",
    surface: "100% beach",
    elevationGain: 4,
    cutoff: "None",
    minimumAge: 0,
    featuredDistance: "3K",
    fromPrice: 12,
    registered: 730,
    capacity: 1000,
    organizerId: "costa-club",
    popularity: 88,
    categories: [
      { id: "mile", name: "1 Mile", distanceKm: 1.6, price: 12, startTime: "6:45 AM", wave: "Kids", capacity: 300, registered: 268 },
      { id: "3k", name: "3K", distanceKm: 3, price: 18, startTime: "7:00 AM", wave: "Open", capacity: 700, registered: 462 },
    ],
    included: [
      { icon: "bib", label: "Race bib", detail: "Kids can colour theirs in" },
      { icon: "medal", label: "Finisher medal", detail: "Every runner, every age" },
      { icon: "shirt", label: "Event shirt", detail: "Cotton, youth sizes too" },
      { icon: "hydration", label: "Hydration", detail: "Start and finish" },
      { icon: "photos", label: "Digital photos", detail: "Free, unwatermarked" },
    ],
    schedule: [
      { time: "6:00 AM", label: "Check-in opens at Kiosko 12" },
      { time: "6:45 AM", label: "Kids mile start" },
      { time: "7:00 AM", label: "3K start", emphasis: true },
      { time: "8:00 AM", label: "Beach breakfast and raffle" },
    ],
    aidStations: [{ km: 1.5, label: "Aid 1 · Turnaround", offers: ["Water"] }],
    parking: "Balneario lot, $4 per car",
    directions: "PR-3 east, exit at km 35.4",
  },
  {
    id: "pt5k",
    slug: "ponce-track-night-5k",
    name: "Ponce Track Night 5K",
    tagline: "Twelve and a half laps under the lights. Pure time trial.",
    description: [
      "A stadium 5K on the Ponce municipal track, seeded into heats by submitted time. Lap counting, a live pace clock on the infield, and a field that is there to run a number.",
      "Submit a recent 5K or an estimated time at registration — heats are published the night before.",
    ],
    type: "Track",
    city: "Ponce",
    region: "Puerto Rico",
    venue: "Estadio Francisco Montaner",
    address: "Av. Las Américas, Ponce, PR 00716",
    map: { x: 30, y: 74 },
    date: "2026-10-24",
    dow: "SAT",
    day: "24",
    month: "OCT",
    year: "2026",
    startTime: "7:30 PM",
    registrationCloses: "October 21",
    registrationStatus: "opening-soon",
    statusLabel: "Opens Sep 15",
    difficulty: "Moderate",
    terrain: "Mondo track",
    surface: "100% track",
    elevationGain: 0,
    cutoff: "35:00",
    minimumAge: 16,
    featuredDistance: "5K",
    fromPrice: 20,
    registered: 64,
    capacity: 180,
    organizerId: "neons-pr",
    popularity: 61,
    categories: [
      { id: "5k", name: "5K", distanceKm: 5, price: 20, startTime: "7:30 PM", wave: "Seeded heats", capacity: 180, registered: 64 },
    ],
    included: [
      { icon: "bib", label: "Race bib", detail: "Heat and lane printed" },
      { icon: "chip", label: "Timing chip", detail: "Lap-by-lap splits" },
      { icon: "medal", label: "Finisher medal", detail: "Heat winners only" },
      { icon: "hydration", label: "Hydration", detail: "Infield table" },
      { icon: "photos", label: "Digital photos", detail: "Free, unwatermarked" },
    ],
    schedule: [
      { time: "6:30 PM", label: "Check-in and warm-up track opens" },
      { time: "7:30 PM", label: "Heat 1 · sub-18:00", emphasis: true },
      { time: "8:05 PM", label: "Heat 2 · 18:00–22:00" },
      { time: "8:45 PM", label: "Heat 3 · open" },
      { time: "9:30 PM", label: "Results posted" },
    ],
    aidStations: [{ km: 2.5, label: "Infield table", offers: ["Water"] }],
    parking: "Stadium lot, free",
    directions: "PR-2 to Av. Las Américas, entrance C",
  },
];

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
        overallPlace: 42,
        overallField: 528,
        genderPlace: 34,
        genderField: 281,
        agePlace: 8,
        ageField: 74,
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
        overallPlace: 88,
        overallField: 612,
        genderPlace: 71,
        genderField: 340,
        agePlace: 14,
        ageField: 96,
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
        overallPlace: 3,
        overallField: 214,
        genderPlace: 3,
        genderField: 118,
        agePlace: 1,
        ageField: 38,
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
        overallPlace: 204,
        overallField: 741,
        genderPlace: 168,
        genderField: 402,
        agePlace: 31,
        ageField: 118,
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

export const PARTICIPANTS: Participant[] = [
  { bib: "1048", name: "Alex Rivera", initials: "AR", age: 32, gender: "M", distance: "10K", shirt: "M", registeredOn: "12 Aug 2026", paid: true, checkedIn: false, email: "alex.rivera@email.com" },
  { bib: "1049", name: "María Colón", initials: "MC", age: 28, gender: "F", distance: "10K", shirt: "S", registeredOn: "12 Aug 2026", paid: true, checkedIn: true, email: "maria.colon@email.com" },
  { bib: "1050", name: "Jorge Torres", initials: "JT", age: 41, gender: "M", distance: "Half Marathon", shirt: "L", registeredOn: "11 Aug 2026", paid: true, checkedIn: true, email: "jorge.torres@email.com" },
  { bib: "1051", name: "Lourdes Díaz", initials: "LD", age: 35, gender: "F", distance: "5K", shirt: "M", registeredOn: "11 Aug 2026", paid: false, checkedIn: false, email: "lourdes.diaz@email.com" },
  { bib: "1052", name: "Kevin Ortiz", initials: "KO", age: 24, gender: "M", distance: "10K", shirt: "L", registeredOn: "10 Aug 2026", paid: true, checkedIn: false, email: "kevin.ortiz@email.com" },
  { bib: "1053", name: "Sofía Ramos", initials: "SR", age: 30, gender: "F", distance: "Half Marathon", shirt: "XS", registeredOn: "10 Aug 2026", paid: true, checkedIn: false, email: "sofia.ramos@email.com" },
  { bib: "1054", name: "Néstor Vega", initials: "NV", age: 52, gender: "M", distance: "5K", shirt: "XL", registeredOn: "09 Aug 2026", paid: true, checkedIn: true, email: "nestor.vega@email.com" },
  { bib: "1055", name: "Carla Mendoza", initials: "CM", age: 27, gender: "F", distance: "10K", shirt: "S", registeredOn: "09 Aug 2026", paid: true, checkedIn: false, email: "carla.mendoza@email.com" },
  { bib: "1056", name: "Diego Santiago", initials: "DS", age: 38, gender: "M", distance: "10K", shirt: "M", registeredOn: "08 Aug 2026", paid: false, checkedIn: false, email: "diego.santiago@email.com" },
  { bib: "1057", name: "Paola Quiñones", initials: "PQ", age: 22, gender: "F", distance: "5K", shirt: "M", registeredOn: "08 Aug 2026", paid: true, checkedIn: false, email: "paola.q@email.com" },
  { bib: "1058", name: "Ramón Feliciano", initials: "RF", age: 45, gender: "M", distance: "Half Marathon", shirt: "L", registeredOn: "07 Aug 2026", paid: true, checkedIn: true, email: "ramon.f@email.com" },
  { bib: "1059", name: "Yaritza Pagán", initials: "YP", age: 33, gender: "F", distance: "10K", shirt: "M", registeredOn: "07 Aug 2026", paid: true, checkedIn: false, email: "yaritza.pagan@email.com" },
];

export const LEADERBOARD: LeaderboardRow[] = [
  { place: 1, name: "Andrés Maldonado", bib: "0012", time: "31:04", pace: "3:06 / km", gender: "M", ageGroup: "25–29" },
  { place: 2, name: "Keila Santana", bib: "0031", time: "32:48", pace: "3:17 / km", gender: "F", ageGroup: "30–34" },
  { place: 3, name: "Luis Beltrán", bib: "0008", time: "33:12", pace: "3:19 / km", gender: "M", ageGroup: "20–24" },
  { place: 4, name: "Rosa Nieves", bib: "0044", time: "34:50", pace: "3:29 / km", gender: "F", ageGroup: "35–39" },
  { place: 5, name: "Iván Cordero", bib: "0117", time: "35:22", pace: "3:32 / km", gender: "M", ageGroup: "30–34" },
  { place: 6, name: "Gabriela Ruiz", bib: "0203", time: "36:41", pace: "3:40 / km", gender: "F", ageGroup: "25–29" },
  { place: 7, name: "Héctor Lugo", bib: "0076", time: "37:15", pace: "3:44 / km", gender: "M", ageGroup: "40–44" },
  { place: 8, name: "Ana Mercado", bib: "0158", time: "38:02", pace: "3:48 / km", gender: "F", ageGroup: "30–34" },
  { place: 41, name: "Marisol Rivera", bib: "1102", time: "48:10", pace: "4:49 / km", gender: "F", ageGroup: "30–34" },
  { place: 42, name: "Alex Rivera", handle: "alex-rivera", bib: "1048", time: "48:22", pace: "4:50 / km", gender: "M", ageGroup: "30–34" },
  { place: 43, name: "Omar Berríos", bib: "1211", time: "48:35", pace: "4:52 / km", gender: "M", ageGroup: "35–39" },
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
    href: "/dashboard",
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

/**
 * The fixtures above are the base record, written in English the way a real
 * API would return one row per event. Everything the UI reads flows through
 * the accessors below, which layer the requested locale's copy on top and
 * re-derive the display date parts. Swapping in a real API stays a one-layer
 * change; swapping in a real translation table does too.
 */

/** Slugs are locale-independent, so route generation needs no locale. */
export function getEventSlugs(): string[] {
  return EVENTS.map((e) => e.slug);
}

function localizeEvent(event: RunningEvent, locale: Locale): RunningEvent {
  // Weekday and month abbreviations always follow the locale, in both
  // languages, so they are derived rather than stored.
  const localized: RunningEvent = {
    ...event,
    dow: formatWeekdayShort(event.date, locale),
    month: formatMonthShort(event.date, locale),
  };

  const copy = locale === "es" ? EVENT_COPY_ES[event.slug] : undefined;
  if (!copy) return localized;

  return {
    ...localized,
    tagline: copy.tagline,
    description: copy.description,
    registrationCloses: copy.registrationCloses,
    statusLabel: copy.statusLabel,
    terrain: copy.terrain,
    surface: copy.surface,
    cutoff: copy.cutoff ?? event.cutoff,
    parking: copy.parking,
    directions: copy.directions,
    included: event.included.map((item) => {
      const translated = copy.included?.[item.icon];
      return translated ? { ...item, ...translated } : item;
    }),
    schedule: event.schedule.map((item) => ({
      ...item,
      label: copy.schedule[item.time] ?? item.label,
    })),
    aidStations: event.aidStations.map((station) => ({
      ...station,
      label: copy.aidStations[String(station.km)] ?? station.label,
    })),
  };
}

export function getEvents(locale: Locale): RunningEvent[] {
  return EVENTS.map((event) => localizeEvent(event, locale));
}

export function getEventBySlug(
  slug: string,
  locale: Locale,
): RunningEvent | undefined {
  const event = EVENTS.find((e) => e.slug === slug);
  return event && localizeEvent(event, locale);
}

export function getOrganizer(id: string, locale: Locale): Organizer {
  const organizer = ORGANIZERS.find((o) => o.id === id) ?? ORGANIZERS[0];
  if (locale !== "es") return organizer;
  return { ...organizer, blurb: ORGANIZER_BLURB_ES[organizer.id] ?? organizer.blurb };
}

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

export function getRunner(handle: string, locale: Locale): Runner | undefined {
  const runner = RUNNERS.find((r) => r.handle === handle);
  return runner && localizeRunner(runner, locale);
}

export function currentRunner(locale: Locale): Runner {
  return localizeRunner(RUNNERS[0], locale);
}

export function getParticipants(locale: Locale): Participant[] {
  if (locale !== "es") return PARTICIPANTS;
  return PARTICIPANTS.map((p) => ({
    ...p,
    registeredOn: localizeDateStamp(p.registeredOn),
  }));
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
 * Whole days between the reference date and the event. The fixtures live in
 * 2026, so the reference is pinned to keep every countdown in the demo stable
 * and identical between server and client render.
 */
export const TODAY = new Date("2026-08-25T08:00:00");

export function daysUntil(isoDate: string, from: Date = TODAY): number {
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.max(0, Math.ceil((target.getTime() - from.getTime()) / 86_400_000));
}

/* ------------------------------------------------------------------ */
/* Organizer analytics                                                 */
/* ------------------------------------------------------------------ */

export const REGISTRATIONS_SERIES = [
  { label: "W23", value: 38 },
  { label: "W24", value: 52 },
  { label: "W25", value: 47 },
  { label: "W26", value: 71 },
  { label: "W27", value: 88 },
  { label: "W28", value: 76 },
  { label: "W29", value: 104 },
  { label: "W30", value: 129 },
  { label: "W31", value: 118 },
  { label: "W32", value: 156 },
  { label: "W33", value: 181 },
  { label: "W34", value: 224 },
];

export const REVENUE_SERIES = [
  { label: "Mar", value: 4120 },
  { label: "Apr", value: 5380 },
  { label: "May", value: 4960 },
  { label: "Jun", value: 6740 },
  { label: "Jul", value: 8210 },
  { label: "Aug", value: 9010 },
];

export const DEMOGRAPHICS_SERIES = [
  { label: "Under 20", women: 34, men: 41 },
  { label: "20–29", women: 148, men: 162 },
  { label: "30–39", women: 194, men: 211 },
  { label: "40–49", women: 121, men: 138 },
  { label: "50+", women: 62, men: 73 },
];

export const ORGANIZER_EVENTS = [
  { slug: "neon-night-10k", registered: 342, capacity: 500, revenue: 15420, status: "Live" as const },
  { slug: "ponce-track-night-5k", registered: 64, capacity: 180, revenue: 1280, status: "Draft" as const },
  { slug: "vieques-sunrise-marathon", registered: 96, capacity: 200, revenue: 8640, status: "Live" as const },
  { slug: "condado-coastal-10k", registered: 518, capacity: 530, revenue: 13080, status: "Closing" as const },
];

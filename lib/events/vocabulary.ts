import type { Difficulty, Distance, EventType } from "@/lib/types";

/**
 * The fixed choices an event is built from, shared by the publish wizard (to
 * render them) and the server action (to validate against them). Each list
 * mirrors a Postgres enum in `20261012120000_events.sql`.
 */

export const EVENT_TYPES: EventType[] = [
  "Road Race",
  "Trail",
  "Track",
  "Virtual Race",
  "Charity Run",
  "Fun Run",
  "Relay",
  "Kids Race",
];

/**
 * Each distance with the kilometres the wizard pre-fills. Ultra has no
 * standard length, so 50 km is only a starting point the organizer edits.
 */
export const DISTANCE_KM: Record<Distance, number> = {
  "1 Mile": 1.61,
  "3K": 3,
  "5K": 5,
  "10K": 10,
  "Half Marathon": 21.1,
  Marathon: 42.2,
  Ultra: 50,
};

export const DISTANCES = Object.keys(DISTANCE_KM) as Distance[];

export const DIFFICULTIES: Difficulty[] = ["Easy", "Moderate", "Hard"];

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** Longest carrier tracking number on a mailed kit; mirrors `mark_kit_shipped()`. */
export const MAX_TRACKING_LENGTH = 100;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const COUNTRIES = ["PR", "US", "DO", "other"] as const;
export type Country = (typeof COUNTRIES)[number];

/** Puerto Rico's 78 municipalities — the city choices when the country is PR. */
export const PR_MUNICIPALITIES = [
  "Adjuntas",
  "Aguada",
  "Aguadilla",
  "Aguas Buenas",
  "Aibonito",
  "Añasco",
  "Arecibo",
  "Arroyo",
  "Barceloneta",
  "Barranquitas",
  "Bayamón",
  "Cabo Rojo",
  "Caguas",
  "Camuy",
  "Canóvanas",
  "Carolina",
  "Cataño",
  "Cayey",
  "Ceiba",
  "Ciales",
  "Cidra",
  "Coamo",
  "Comerío",
  "Corozal",
  "Culebra",
  "Dorado",
  "Fajardo",
  "Florida",
  "Guánica",
  "Guayama",
  "Guayanilla",
  "Guaynabo",
  "Gurabo",
  "Hatillo",
  "Hormigueros",
  "Humacao",
  "Isabela",
  "Jayuya",
  "Juana Díaz",
  "Juncos",
  "Lajas",
  "Lares",
  "Las Marías",
  "Las Piedras",
  "Loíza",
  "Luquillo",
  "Manatí",
  "Maricao",
  "Maunabo",
  "Mayagüez",
  "Moca",
  "Morovis",
  "Naguabo",
  "Naranjito",
  "Orocovis",
  "Patillas",
  "Peñuelas",
  "Ponce",
  "Quebradillas",
  "Rincón",
  "Río Grande",
  "Sabana Grande",
  "Salinas",
  "San Germán",
  "San Juan",
  "San Lorenzo",
  "San Sebastián",
  "Santa Isabel",
  "Toa Alta",
  "Toa Baja",
  "Trujillo Alto",
  "Utuado",
  "Vega Alta",
  "Vega Baja",
  "Vieques",
  "Villalba",
  "Yabucoa",
  "Yauco",
] as const;

export function isOneOf<T extends string>(
  list: readonly T[],
  value: string,
): value is T {
  return (list as readonly string[]).includes(value);
}

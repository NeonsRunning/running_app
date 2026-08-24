import type es from "@/dictionaries/es.json";

/**
 * The Spanish dictionary is the source of truth for the key set: every other
 * locale's JSON is checked against this shape, so a missing or misspelled key
 * fails the build instead of surfacing as a blank label at runtime.
 */
export type Dictionary = typeof es;

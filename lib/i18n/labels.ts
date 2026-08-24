import type { Translate } from "./translate";

/**
 * Domain vocabulary that doubles as data.
 *
 * Values like `EventType` and `Distance` are the canonical keys the filters
 * and fixtures compare against, so they stay in English in the data and are
 * translated only at render. A value with no entry in the dictionary falls
 * back to itself, so new fixture vocabulary degrades to readable text rather
 * than a raw key.
 */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[·]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function domainLabel(
  t: Translate,
  group: string,
  value: string,
): string {
  const key = `labels.${group}.${slug(value)}`;
  return t.has(key) ? t(key) : value;
}

export const eventTypeLabel = (t: Translate, v: string) =>
  domainLabel(t, "eventType", v);

export const distanceLabel = (t: Translate, v: string) =>
  domainLabel(t, "distance", v);

export const difficultyLabel = (t: Translate, v: string) =>
  domainLabel(t, "difficulty", v);

export const waveLabel = (t: Translate, v: string) => domainLabel(t, "wave", v);

export const aidOfferLabel = (t: Translate, v: string) =>
  domainLabel(t, "aidOffer", v);

export const genderLabel = (t: Translate, v: string) =>
  domainLabel(t, "gender", v);

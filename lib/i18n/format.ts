import { LOCALE_TAGS, type Locale } from "./config";

/**
 * Locale-aware formatting.
 *
 * Every formatter takes the locale explicitly so the same helpers work in
 * server components (which read it from root params) and client components
 * (which read it from the i18n context).
 */

/** Noon avoids the date shifting a day under any timezone offset. */
function atNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

export function formatLongDate(isoDate: string, locale: Locale): string {
  return atNoon(isoDate).toLocaleDateString(LOCALE_TAGS[locale], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMediumDate(isoDate: string, locale: Locale): string {
  return atNoon(isoDate).toLocaleDateString(LOCALE_TAGS[locale], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Short weekday for the date blocks on event cards, e.g. "SAT" / "SÁB". */
export function formatWeekdayShort(isoDate: string, locale: Locale): string {
  return atNoon(isoDate)
    .toLocaleDateString(LOCALE_TAGS[locale], { weekday: "short" })
    .replace(/\.$/, "")
    .toUpperCase();
}

/** Short month for the date blocks, e.g. "SEP". */
export function formatMonthShort(isoDate: string, locale: Locale): string {
  return atNoon(isoDate)
    .toLocaleDateString(LOCALE_TAGS[locale], { month: "short" })
    .replace(/\.$/, "")
    .toUpperCase();
}

/** Day-period markers, written out rather than taken from `Intl`. */
const DAY_PERIODS: Record<Locale, { am: string; pm: string }> = {
  es: { am: "a. m.", pm: "p. m." },
  en: { am: "AM", pm: "PM" },
};

/**
 * Re-render a fixture clock string ("6:00 PM") in the active locale. Spanish
 * keeps the 12-hour clock but writes the marker as "p. m.".
 *
 * Assembled by hand instead of with `toLocaleTimeString`, because the space
 * before the day period is an ICU/CLDR detail that changes between versions
 * (plain space, U+00A0, U+202F). Node and the browser ship different ICU
 * builds, so the two strings look identical but differ by an invisible
 * character, and React reports it as a hydration mismatch.
 */
export function formatClock(time: string, locale: Locale): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return time;

  const [, rawHour, minute, marker] = match;
  const hour = Number.parseInt(rawHour, 10) % 12 || 12;
  const period = DAY_PERIODS[locale][marker.toUpperCase() === "PM" ? "pm" : "am"];

  return `${hour}:${minute} ${period}`;
}

export function formatMoney(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/** Whole-dollar form for headline prices: "$30" rather than "$30.00". */
export function formatMoneyWhole(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value);
}

/** Distances read "21,1 km" in Spanish and "21.1 km" in English. */
export function formatDistance(km: number, locale: Locale): string {
  const value = new Intl.NumberFormat(LOCALE_TAGS[locale], {
    maximumFractionDigits: 1,
  }).format(km);
  return `${value} km`;
}

export function createFormatters(locale: Locale) {
  return {
    longDate: (iso: string) => formatLongDate(iso, locale),
    mediumDate: (iso: string) => formatMediumDate(iso, locale),
    weekdayShort: (iso: string) => formatWeekdayShort(iso, locale),
    monthShort: (iso: string) => formatMonthShort(iso, locale),
    clock: (time: string) => formatClock(time, locale),
    money: (amount: number) => formatMoney(amount, locale),
    moneyWhole: (amount: number) => formatMoneyWhole(amount, locale),
    number: (value: number) => formatNumber(value, locale),
    distance: (km: number) => formatDistance(km, locale),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

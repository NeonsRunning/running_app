/**
 * Locale configuration shared by the proxy, server components and client
 * components. Deliberately free of server-only imports so the same helpers
 * run in every environment.
 */

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Spanish is the default and lives at the root of the URL space (`/events`).
 * English is prefixed (`/en/events`). See `localizePath` for the one place
 * that rule is encoded.
 */
export const DEFAULT_LOCALE: Locale = "es";

/** BCP 47 tags used for `Intl` formatting and the `<html lang>` attribute. */
export const LOCALE_TAGS: Record<Locale, string> = {
  es: "es-PR",
  en: "en-US",
};

/** Names shown in the language switcher, each written in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Turn an app-relative path into a URL for `locale`. The default locale is
 * unprefixed, so this is the inverse of `splitLocale`.
 */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  // "/" would otherwise become "/en/", which redirects.
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Split a request pathname into its locale and the path beneath it. Paths
 * without a locale prefix belong to the default locale.
 */
export function splitLocale(pathname: string): {
  locale: Locale;
  path: string;
} {
  const segments = pathname.split("/");
  // segments[0] is always "" for an absolute path.
  const first = segments[1] ?? "";

  if (isLocale(first)) {
    const rest = `/${segments.slice(2).join("/")}`;
    return { locale: first, path: rest === "/" ? "/" : rest.replace(/\/$/, "") };
  }

  return { locale: DEFAULT_LOCALE, path: pathname };
}

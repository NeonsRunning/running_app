import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";
import { createTranslator, type Translate } from "./translate";
import type { Dictionary } from "./types";

/**
 * Server-side locale and dictionary access.
 *
 * The locale comes from `next/root-params` rather than a prop, so any server
 * component or server-side utility can translate without the locale being
 * threaded through every layer. Client components read the same dictionary
 * from `I18nProvider`, which the root layout seeds from `getDictionary()`.
 */
const dictionaries = {
  es: () => import("@/dictionaries/es.json").then((m) => m.default),
  en: () => import("@/dictionaries/en.json").then((m) => m.default),
} satisfies Record<Locale, () => Promise<Dictionary>>;

/** The locale for the current request. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  // Unreachable through the proxy, but a hand-typed `/de/events` lands here.
  if (!value || !isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<Dictionary> {
  const locale = await getLocale();
  return dictionaries[locale]();
}

/** Translator for the current request. */
export async function getT(): Promise<Translate> {
  const locale = await getLocale();
  const dict = await dictionaries[locale]();
  return createTranslator(dict, locale);
}

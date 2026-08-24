"use client";

import { createContext, useContext, useMemo } from "react";
import { LOCALE_TAGS, type Locale } from "@/lib/i18n/config";
import { createTranslator, type Translate } from "@/lib/i18n/translate";
import { createFormatters, type Formatters } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/types";

/**
 * Client-side access to the active locale and its dictionary.
 *
 * `next/root-params` is server-only, so the root layout resolves the
 * dictionary once and hands it to this provider. Client components then read
 * strings through `useT()` instead of receiving them as props.
 */
type I18nValue = {
  locale: Locale;
  tag: string;
  dict: Dictionary;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, tag: LOCALE_TAGS[locale], dict }),
    [locale, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/** The BCP 47 tag for the active locale, for `Intl` formatters. */
export function useLocaleTag(): string {
  return useI18n().tag;
}

/**
 * Translator bound to the active locale. The dictionary is stable for the
 * lifetime of a page, so the translator is built once per locale change.
 */
export function useT(): Translate {
  const { dict, locale } = useI18n();
  return useMemo(() => createTranslator(dict, locale), [dict, locale]);
}

/** Locale-bound date, time, number and currency formatters. */
export function useFormat(): Formatters {
  const { locale } = useI18n();
  return useMemo(() => createFormatters(locale), [locale]);
}

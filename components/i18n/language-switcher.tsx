"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NextLink from "next/link";
import {
  LOCALES,
  LOCALE_NAMES,
  localizePath,
  splitLocale,
} from "@/lib/i18n/config";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "./provider";

/**
 * Switches language without losing the reader's place: the current path and
 * query are carried across, so a filtered event list stays filtered.
 *
 * Rendered as links rather than a select so each language is a real,
 * shareable URL the browser can prefetch.
 */
function LanguageLinks({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const active = useLocale();
  const t = useT();
  const pathname = usePathname();

  // `usePathname` reports the browser URL, which for Spanish has no prefix.
  const { path } = splitLocale(pathname);
  const suffix = query ? `?${query}` : "";

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t("common.language")}
    >
      {LOCALES.map((locale) => {
        const current = locale === active;
        return (
          <NextLink
            key={locale}
            href={`${localizePath(path, locale)}${suffix}`}
            hrefLang={locale}
            aria-current={current ? "true" : undefined}
            className={cn(
              "px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors",
              current ? "text-neon-yellow" : "text-fg-dim hover:text-fg",
            )}
          >
            <span className="sr-only">{LOCALE_NAMES[locale]}</span>
            <span aria-hidden="true">{locale}</span>
          </NextLink>
        );
      })}
    </div>
  );
}

/** Reads the query string, which is only available once the client takes over. */
function LanguageLinksWithQuery({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  return (
    <LanguageLinks query={searchParams.toString()} className={className} />
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  return (
    /**
     * `useSearchParams` opts a route out of static prerendering unless it sits
     * behind a Suspense boundary. The switcher renders in the header and
     * footer of every page, so the boundary lives here — the fallback is the
     * same control without the query, which is exactly what the server can
     * know, and it upgrades to the query-preserving version on hydration.
     */
    <Suspense fallback={<LanguageLinks query="" className={className} />}>
      <LanguageLinksWithQuery className={className} />
    </Suspense>
  );
}

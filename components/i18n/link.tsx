"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { localizePath, splitLocale } from "@/lib/i18n/config";
import { useLocale } from "./provider";

type NextLinkProps = React.ComponentProps<typeof NextLink>;

/**
 * `next/link` with the active locale applied to the href.
 *
 * Callers keep writing plain app paths (`/events`), and the prefix — none for
 * Spanish, `/en` for English — is added here. That keeps the locale rule in
 * one place instead of spread across every link in the app.
 */
export function Link({ href, ...rest }: NextLinkProps) {
  const locale = useLocale();

  // External URLs and route objects pass through untouched.
  const localized =
    typeof href === "string" && href.startsWith("/")
      ? localizePath(href, locale)
      : href;

  return <NextLink href={localized} {...rest} />;
}

export default Link;

/**
 * `useRouter` with the same href handling as `Link`, for the handful of
 * places that navigate imperatively.
 */
export function useLocalizedRouter() {
  const router = useRouter();
  const locale = useLocale();

  const push = useCallback(
    (path: string) => router.push(localizePath(path, locale)),
    [router, locale],
  );

  const replace = useCallback(
    (path: string) => router.replace(localizePath(path, locale)),
    [router, locale],
  );

  return useMemo(
    () => ({ ...router, push, replace }),
    [router, push, replace],
  );
}

/**
 * The current pathname with any locale prefix removed, so active-link checks
 * can compare against plain app paths (`/events`) in either language.
 */
export function useAppPathname(): string {
  const pathname = usePathname();
  return useMemo(() => splitLocale(pathname).path, [pathname]);
}

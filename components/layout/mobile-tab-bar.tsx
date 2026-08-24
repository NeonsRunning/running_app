"use client";

import { Link, useAppPathname } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";

const TABS = [
  { href: "/", key: "tabs.home", icon: "▲" },
  { href: "/events", key: "tabs.events", icon: "◈" },
  { href: "/results", key: "tabs.results", icon: "▣" },
  { href: "/community", key: "tabs.community", icon: "◎" },
  { href: SELF_PROFILE_PATH, key: "tabs.profile", icon: "●" },
] as const;

/**
 * Persistent bottom navigation on small screens. Sits above the iOS home
 * indicator via safe-area padding and stays clear of sticky page CTAs.
 */
export function MobileTabBar() {
  const pathname = useAppPathname();
  const t = useT();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-70 grid grid-cols-5 border-t-2 border-line bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-1 border-r-2 border-line px-1 py-2.5 last:border-r-0",
              active ? "text-fg" : "text-fg-dim",
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px] bg-neon-yellow"
              />
            ) : null}
            <span aria-hidden="true" className="text-sm leading-none">
              {tab.icon}
            </span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase">
              {t(tab.key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

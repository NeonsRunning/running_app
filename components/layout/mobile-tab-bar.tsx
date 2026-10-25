"use client";

import { Link, useAppPathname } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { useSession } from "./session";

/** Mirrors the header nav: Results and Community are held back for now. */
const TABS = [
  { href: "/", key: "tabs.home", icon: "▲" },
  { href: "/events", key: "tabs.events", icon: "◈" },
  { href: "/about", key: "tabs.about", icon: "◎" },
] as const;

/**
 * Persistent bottom navigation on small screens. Sits above the iOS home
 * indicator via safe-area padding and stays clear of sticky page CTAs.
 */
export function MobileTabBar() {
  const pathname = useAppPathname();
  const t = useT();
  const session = useSession();

  // Guests get a way in rather than a profile tab that bounces to login. The
  // header's account menu links the profile by id, so match that path too.
  const accountTab = session.signedIn
    ? { href: SELF_PROFILE_PATH, key: "tabs.profile", icon: "●" }
    : { href: "/login", key: "tabs.logIn", icon: "●" };
  const tabs = [...TABS, accountTab];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === SELF_PROFILE_PATH && session.signedIn) {
      return [SELF_PROFILE_PATH, `/runners/${session.id}`].some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-70 grid grid-cols-4 border-t-2 border-line bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((tab) => {
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
                className="absolute inset-x-0 top-0 h-0.75 bg-neon-yellow"
              />
            ) : null}
            <span aria-hidden="true" className="text-sm leading-none">
              {tab.icon}
            </span>
            <span className="font-mono text-[9px] tracking-widest uppercase">
              {t(tab.key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

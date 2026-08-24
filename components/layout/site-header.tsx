"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useAppPathname } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLock } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { BellIcon, SearchIcon } from "@/components/ui/icons";
import { useSession } from "./session";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** Labels are dictionary keys, resolved at render against the active locale. */
const NAV = [
  { href: "/events", key: "nav.events" },
  { href: "/results", key: "nav.results" },
  { href: "/community", key: "nav.community" },
  { href: "/about", key: "nav.about" },
] as const;

/**
 * The account menu, built per session: the profile link needs the user id.
 * Registrations and saved races live on the profile too, so the saved entry
 * is the same page under an anchor.
 */
function accountMenu(session: { id: string; isOrganizer: boolean }) {
  return [
    { href: `/runners/${session.id}`, key: "account.profile" },
    { href: `/runners/${session.id}#saved`, key: "account.savedEvents" },
    { href: "/results", key: "account.results" },
    { href: "/settings", key: "account.settings" },
    // Only organizers have a dashboard to open.
    ...(session.isOrganizer
      ? [{ href: "/organizer", key: "account.organizerDashboard" }]
      : []),
  ];
}

export function SiteHeader() {
  const pathname = useAppPathname();
  const t = useT();
  const session = useSession();
  const accountRef = useRef<HTMLDivElement>(null);

  /**
   * Both menus record the route they were opened on rather than a plain
   * boolean. Navigating changes `pathname`, so they close on their own — no
   * effect, and no cascading render after every route change.
   */
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const [accountOpenAt, setAccountOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === pathname;
  const accountOpen = accountOpenAt === pathname;

  const setMenuOpen = (open: boolean) => setMenuOpenAt(open ? pathname : null);
  const setAccountOpen = (open: boolean) =>
    setAccountOpenAt(open ? pathname : null);

  // Dismiss the account menu on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return;
    // Close via the state setter directly — the helper above is a fresh
    // closure each render and would churn this subscription.
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node))
        setAccountOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpenAt(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-70 border-b-2 border-line bg-ink/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:h-20 lg:gap-8 lg:px-10">
        <BrandLock size={36} compact />

        <nav aria-label={t("nav.main")} className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "border-b-2 pb-1 text-[13px] font-bold tracking-[0.12em] uppercase transition-colors",
                    isActive(item.href)
                      ? "border-neon-yellow text-fg"
                      : "border-transparent text-fg-dim hover:text-fg",
                  )}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1" />

        <Link
          href="/events"
          className="hidden items-center gap-2 font-mono text-[12px] tracking-widest text-fg-dim uppercase hover:text-fg md:flex"
        >
          <SearchIcon size={16} /> {t("common.search")}
        </Link>

        <LanguageSwitcher className="hidden md:flex" />

        {session.signedIn ? (
          <>
            <Link
              href="/notifications"
              className="relative hidden h-10 w-10 items-center justify-center border-2 border-line-strong text-fg-dim hover:border-fg-dim hover:text-fg md:flex"
              aria-label={t("nav.notificationsLabel", {
                count: session.unreadNotifications,
              })}
            >
              <BellIcon size={18} />
              {session.unreadNotifications > 0 ? (
                <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center bg-neon-yellow px-1 text-[10px] font-black text-ink">
                  {session.unreadNotifications}
                </span>
              ) : null}
            </Link>

            <div ref={accountRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 border-2 border-line-strong py-1.5 pr-3 pl-1.5 transition-colors hover:border-fg-dim"
              >
                <span className="flex h-7 w-7 items-center justify-center bg-linear-to-br from-neon-lime to-neon-green text-[11px] font-black text-ink">
                  {session.initials}
                </span>
                <span className="text-xs font-bold tracking-widest uppercase">
                  {session.name.split(" ")[0]}
                </span>
                <span aria-hidden="true" className="text-[10px] text-fg-dim">
                  ▾
                </span>
              </button>

              {accountOpen ? (
                <div
                  role="menu"
                  className="animate-rise-in absolute right-0 mt-2 w-60 border-2 border-line-strong bg-charcoal py-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
                >
                  {accountMenu(session).map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      role="menuitem"
                      className="block px-4 py-2.5 text-sm text-fg-muted hover:bg-graphite hover:text-fg"
                    >
                      {t(item.key)}
                    </Link>
                  ))}
                  <div className="my-2 h-0.5 bg-line" />
                  <SignOutButton
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className="block w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-graphite"
                  >
                    {t("nav.logOut")}
                  </SignOutButton>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="hidden items-center gap-3 md:flex">
            <Button href="/login" size="sm">
              {t("nav.logIn")}
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
        >
          <span
            className={cn(
              "h-0.5 w-6 bg-fg transition-transform",
              menuOpen && "translate-y-2 rotate-45",
            )}
          />
          <span
            className={cn(
              "h-0.5 w-6 bg-fg transition-opacity",
              menuOpen && "opacity-0",
            )}
          />
          <span
            className={cn(
              "h-0.5 w-6 bg-neon-lime transition-transform",
              menuOpen && "-translate-y-2 -rotate-45",
            )}
          />
        </button>
      </div>

      {menuOpen ? (
        <div
          id="mobile-menu"
          className="animate-rise-in border-t-2 border-line bg-charcoal lg:hidden"
        >
          <nav aria-label={t("nav.mobile")} className="flex flex-col">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
              >
                {t(item.key)}
              </Link>
            ))}
            {session.signedIn ? (
              <>
                <Link
                  href={SELF_PROFILE_PATH}
                  className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
                >
                  {t("account.profile")}
                </Link>
                <Link
                  href="/notifications"
                  className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
                >
                  {t("nav.notifications")}
                  {session.unreadNotifications > 0 ? (
                    <span className="ml-2 bg-neon-yellow px-2 py-0.5 text-[11px] text-ink">
                      {session.unreadNotifications}
                    </span>
                  ) : null}
                </Link>
                {session.isOrganizer ? (
                  <Link
                    href="/organizer"
                    className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
                  >
                    {t("nav.organizerDashboard")}
                  </Link>
                ) : null}
                <SignOutButton className="border-b-2 border-line px-5 py-4 text-left text-base font-extrabold tracking-widest text-danger uppercase hover:bg-graphite">
                  {t("nav.logOut")}
                </SignOutButton>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
                >
                  {t("nav.logIn")}
                </Link>
                <Link
                  href="/signup"
                  className="border-b-2 border-line px-5 py-4 text-base font-extrabold tracking-widest uppercase hover:bg-graphite"
                >
                  {t("nav.signUp")}
                </Link>
              </>
            )}
            <div className="flex flex-col gap-4 p-5">
              <Button href="/publish" block size="lg">
                {t("nav.publishEvent")}
              </Button>
              <LanguageSwitcher className="justify-center" />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

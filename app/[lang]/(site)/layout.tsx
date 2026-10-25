import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SessionProvider } from "@/components/layout/session";
import { SavedEventsProvider } from "@/components/events/saved-events";
import { getAccount, isPlatformAdmin, toSession } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data";
import { getSavedSlugs } from "@/lib/events/queries";
import { getLocale } from "@/lib/i18n/server";

/**
 * Chrome shared by every browsable page. The registration, publish and
 * check-in flows live in their own route groups so they can take over the
 * screen without this header competing for attention.
 *
 * The session is resolved here, once, and handed to the client tree. Reading
 * it in the layout means the header renders the right state on the first
 * paint instead of flickering from guest to signed-in after hydration.
 */
export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const account = await getAccount();

  // Notifications are still fixture data pending a table of their own; only
  // the badge count crosses into the session.
  const unreadNotifications = account
    ? getNotifications(locale).filter((n) => n.unread).length
    : 0;

  const [saved, isAdmin] = account
    ? await Promise.all([getSavedSlugs(account.user.id), isPlatformAdmin()])
    : [[], false];

  return (
    <SessionProvider
      value={toSession(account, { unreadNotifications, isAdmin })}
    >
      {/* Keyed by account so signing in or out starts from that account's
          saves rather than whatever the last one left in state. */}
      <SavedEventsProvider key={account?.user.id ?? "guest"} initial={saved}>
        {/* Bottom padding clears the mobile tab bar, and a page's pinned CTA
            above it when one is marked data-mobile-cta. It sits below the
            footer so the footer's last row can scroll clear of both. */}
        <div className="flex min-h-dvh flex-col max-lg:pb-[calc(3.625rem+env(safe-area-inset-bottom))] max-lg:has-data-mobile-cta:pb-[calc(7.125rem+env(safe-area-inset-bottom))]">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <MobileTabBar />
        </div>
      </SavedEventsProvider>
    </SessionProvider>
  );
}

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SessionProvider } from "@/components/layout/session";
import { SavedEventsProvider } from "@/components/events/saved-events";
import { getAccount, toSession } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data";
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

  return (
    <SessionProvider value={toSession(account, { unreadNotifications })}>
      <SavedEventsProvider>
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          {/* Bottom padding clears the mobile tab bar. */}
          <main id="main" className="flex-1 pb-16 lg:pb-0">
            {children}
          </main>
          <SiteFooter />
          <MobileTabBar />
        </div>
      </SavedEventsProvider>
    </SessionProvider>
  );
}

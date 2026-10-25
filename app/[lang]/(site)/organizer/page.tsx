import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import {
  DemographicsChart,
  RegistrationsChart,
  RevenueChart,
} from "@/components/organizer/charts";
import { OrganizerEventList } from "@/components/organizer/event-list";
import { OrganizerOnly } from "@/components/organizer/organizer-only";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrganizer } from "@/lib/auth/session";
import {
  getOrganizerDashboard,
  getOrganizerEvents,
} from "@/lib/events/organizer";
import { createFormatters } from "@/lib/i18n/format";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("organizer.metaTitle"),
    description: t("organizer.metaDescription"),
    robots: NOINDEX,
  };
}

export default async function OrganizerDashboardPage() {
  const account = await requireOrganizer("/organizer");
  if (!account) return <OrganizerOnly />;

  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);
  const [dashboard, firstPage] = await Promise.all([
    getOrganizerDashboard(account.user.id),
    getOrganizerEvents(account.user.id, 0),
  ]);
  const { totals } = dashboard;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-line pb-8">
        <div>
          <Eyebrow>{account.profile?.name ?? t("organizer.eyebrow")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
            {t("organizer.title")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/publish" size="md">
            {t("organizer.createEvent")}
          </Button>
        </div>
      </header>

      {/* Headline figures ------------------------------------------------ */}
      <section
        aria-label={t("organizer.performanceSummary")}
        className="grid grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <StatCard
          value={fmt.number(totals.registrations)}
          label={t("organizer.registrations")}
          accent="lime"
          className="bg-ink"
        />
        <StatCard
          value={fmt.moneyWhole(totals.revenue)}
          label={t("organizer.revenue")}
          accent="yellow"
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(totals.activeEvents)}
          label={t("organizer.activeEvents")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(totals.drafts)}
          label={t("organizer.drafts")}
          className="bg-ink"
        />
      </section>

      {/* Charts ---------------------------------------------------------- */}
      <section className="py-12">
        <SectionHeading
          title={t("organizer.analytics")}
          kicker={t("organizer.analyticsKicker")}
        />
        {totals.registrations > 0 ? (
          <div className="mt-8 grid gap-5 xl:grid-cols-2">
            <div className="xl:col-span-2">
              <RegistrationsChart data={dashboard.registrationsSeries} />
            </div>
            <RevenueChart data={dashboard.revenueSeries} />
            <DemographicsChart data={dashboard.demographics} />
          </div>
        ) : (
          <p className="mt-8 border-2 border-dashed border-line px-6 py-12 text-center text-[15px] text-fg-dim">
            {t("organizer.noRegistrations")}
          </p>
        )}
      </section>

      {/* My events ------------------------------------------------------- */}
      <section className="pb-14">
        <SectionHeading
          title={t("organizer.myEvents")}
          kicker={t("organizer.eventCount", { count: dashboard.eventCount })}
          href="/publish"
          hrefLabel={t("organizer.createEvent")}
        />

        {firstPage.events.length === 0 ? (
          <div className="mt-8 border-2 border-dashed border-line px-6 py-14 text-center">
            <p className="font-display text-2xl font-black uppercase">
              {t("organizer.noEventsTitle")}
            </p>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-fg-dim">
              {t("organizer.noEventsBody")}
            </p>
            <Button href="/publish" size="lg" className="mt-7">
              {t("organizer.createEvent")}
            </Button>
          </div>
        ) : (
          <OrganizerEventList initialPage={firstPage} />
        )}
      </section>
    </div>
  );
}

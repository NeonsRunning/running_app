import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { Progress, SectionHeading } from "@/components/ui/misc";
import {
  DemographicsChart,
  RegistrationsChart,
  RevenueChart,
} from "@/components/organizer/charts";
import { DeleteEventButton } from "@/components/organizer/delete-event-button";
import { OrganizerOnly } from "@/components/organizer/organizer-only";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrganizer } from "@/lib/auth/session";
import {
  getOrganizerDashboard,
  type DashboardStatus,
} from "@/lib/events/organizer";
import { createFormatters } from "@/lib/i18n/format";
import { domainLabel } from "@/lib/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("organizer.metaTitle"),
    description: t("organizer.metaDescription"),
  };
}

const STATUS_TONE: Record<DashboardStatus, "lime" | "outline" | "yellow" | "neutral"> = {
  Live: "lime",
  Draft: "outline",
  Closing: "yellow",
  Finished: "neutral",
};

/** Card actions share one shape so the row stays a single map. */
const ACTION_CLASS =
  "border-2 border-line-strong px-3 py-2 text-[11px] font-bold tracking-wider text-fg-muted uppercase transition-colors hover:border-neon-lime hover:text-neon-lime";

export default async function OrganizerDashboardPage() {
  const account = await requireOrganizer("/organizer");
  if (!account) return <OrganizerOnly />;

  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);
  const dashboard = await getOrganizerDashboard(account.user.id);
  const { totals, events } = dashboard;

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
          <Button href="/organizer/checkin" variant="outline" size="md">
            {t("organizer.checkin")}
          </Button>
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
          kicker={t("organizer.eventCount", { count: events.length })}
          href="/publish"
          hrefLabel={t("organizer.createEvent")}
        />

        {events.length === 0 ? (
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
          <ul className="mt-8 grid gap-5 lg:grid-cols-2">
            {events.map((event) => (
              <li key={event.id} className="border-2 border-line bg-carbon">
                <div className="flex items-start justify-between gap-4 border-b-2 border-line px-5 py-5">
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl font-black wrap-break-word uppercase">
                      <Link
                        href={`/organizer/events/${event.id}/edit`}
                        className="hover:text-neon-lime"
                      >
                        {event.name}
                      </Link>
                    </h3>
                    <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                      {[
                        event.date ? fmt.mediumDate(event.date) : t("organizer.noDate"),
                        event.city,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[event.status]}>
                    {domainLabel(t, "eventStatus", event.status)}
                  </Badge>
                </div>

                <div className="px-5 py-5">
                  {event.capacity > 0 ? (
                    <Progress
                      value={event.registered}
                      max={event.capacity}
                      label={t("organizer.runners")}
                      tone={event.registered / event.capacity > 0.9 ? "yellow" : "lime"}
                    />
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
                    <span className="text-fg-dim">
                      {t("organizer.registeredOf", {
                        registered: fmt.number(event.registered),
                        capacity: fmt.number(event.capacity),
                      })}
                    </span>
                    <span className="text-fg-dim">
                      {t("organizer.revenueInline")}{" "}
                      <b className="font-bold text-fg">
                        {fmt.moneyWhole(event.revenue)}
                      </b>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t-2 border-line px-5 py-4">
                  <Link
                    href={`/organizer/events/${event.id}/edit`}
                    className={ACTION_CLASS}
                  >
                    {t("organizer.actions.edit")}
                  </Link>
                  {event.status !== "Draft" ? (
                    <Link href={`/events/${event.slug}`} className={ACTION_CLASS}>
                      {t("organizer.actions.view")}
                    </Link>
                  ) : null}
                  {/* Registrations hold an event in place; no point offering
                      a delete the database will refuse. */}
                  {event.registered === 0 ? (
                    <DeleteEventButton
                      id={event.id}
                      name={event.name}
                      live={event.status !== "Draft"}
                      className={ACTION_CLASS}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

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
import {
  DEMOGRAPHICS_SERIES,
  ORGANIZER_EVENTS,
  REGISTRATIONS_SERIES,
  REVENUE_SERIES,
  getEventBySlug,
} from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { createFormatters } from "@/lib/i18n/format";
import { domainLabel } from "@/lib/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("organizer.metaTitle"),
    description: t("organizer.metaDescription"),
  };
}

const STATUS_TONE = {
  Live: "lime",
  Draft: "outline",
  Closing: "yellow",
} as const;

export default async function OrganizerDashboardPage() {
  await requireUser("/organizer");

  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const events = ORGANIZER_EVENTS.map((oe) => ({
    ...oe,
    event: getEventBySlug(oe.slug, locale),
  })).filter((oe): oe is typeof oe & { event: NonNullable<typeof oe.event> } =>
    Boolean(oe.event),
  );

  /** Card actions share one shape so the row stays a single map. */
  const actions = (slug: string) => [
    { key: "organizer.actions.manage", href: `/events/${slug}` },
    { key: "organizer.actions.participants", href: "/organizer/participants" },
    { key: "organizer.actions.edit", href: "/publish" },
    { key: "organizer.actions.duplicate", href: "/publish" },
    { key: "organizer.actions.results", href: `/events/${slug}/results` },
    { key: "organizer.actions.share", href: `/events/${slug}` },
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-line pb-8">
        <div>
          <Eyebrow>{t("organizer.eyebrow")}</Eyebrow>
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
          value={fmt.number(1284)}
          label={t("organizer.registrations")}
          accent="lime"
          className="bg-ink"
        />
        <StatCard
          value={fmt.moneyWhole(38420)}
          label={t("organizer.revenue")}
          accent="yellow"
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(4)}
          label={t("organizer.activeEvents")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(8420)}
          label={t("organizer.profileViews")}
          className="bg-ink"
        />
      </section>

      {/* Charts ---------------------------------------------------------- */}
      <section className="py-12">
        <SectionHeading
          title={t("organizer.analytics")}
          kicker={t("organizer.analyticsKicker")}
        />
        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <RegistrationsChart data={REGISTRATIONS_SERIES} />
          </div>
          <RevenueChart data={REVENUE_SERIES} />
          <DemographicsChart data={DEMOGRAPHICS_SERIES} />
        </div>
      </section>

      {/* My events ------------------------------------------------------- */}
      <section className="pb-14">
        <SectionHeading
          title={t("organizer.myEvents")}
          kicker={t("organizer.eventCount", { count: events.length })}
          href="/publish"
          hrefLabel={t("organizer.createEvent")}
        />

        <ul className="mt-8 grid gap-5 lg:grid-cols-2">
          {events.map(({ event, registered, capacity, revenue, status }) => (
            <li key={event.slug} className="border-2 border-line bg-carbon">
              <div className="flex items-start justify-between gap-4 border-b-2 border-line px-5 py-5">
                <div>
                  <h3 className="font-display text-2xl font-black uppercase">
                    <Link
                      href={`/events/${event.slug}`}
                      className="hover:text-neon-lime"
                    >
                      {event.name}
                    </Link>
                  </h3>
                  <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                    {event.month} {event.day}, {event.year} · {event.city}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[status]}>
                  {domainLabel(t, "eventStatus", status)}
                </Badge>
              </div>

              <div className="px-5 py-5">
                <Progress
                  value={registered}
                  max={capacity}
                  label={t("organizer.runners")}
                  tone={registered / capacity > 0.9 ? "yellow" : "lime"}
                />
                <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
                  <span className="text-fg-dim">
                    {t("organizer.capacityPercent", {
                      percent: Math.round((registered / capacity) * 100),
                    })}
                  </span>
                  <span className="text-fg-dim">
                    {t("organizer.revenueInline")}{" "}
                    <b className="font-bold text-fg">
                      {fmt.moneyWhole(revenue)}
                    </b>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t-2 border-line px-5 py-4">
                {actions(event.slug).map((a) => (
                  <Link
                    key={a.key}
                    href={a.href}
                    className="border-2 border-line-strong px-3 py-2 text-[11px] font-bold tracking-wider text-fg-muted uppercase transition-colors hover:border-neon-lime hover:text-neon-lime"
                  >
                    {t(a.key)}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

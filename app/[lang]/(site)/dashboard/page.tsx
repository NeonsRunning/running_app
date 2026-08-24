import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import { EventCardCompact } from "@/components/events/event-card";
import { SavedEventsPanel } from "@/components/dashboard/saved-panel";
import {
  currentRunner,
  daysUntil,
  getEventBySlug,
  getEvents,
} from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel, waveLabel } from "@/lib/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("dashboard.metaTitle"),
    description: t("dashboard.metaDescription"),
  };
}

export default async function DashboardPage() {
  await requireUser("/dashboard");

  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const runner = currentRunner(locale);
  const events = getEvents(locale);

  const registrations = runner.upcoming
    .map((u) => ({ ...u, event: getEventBySlug(u.eventSlug, locale) }))
    .filter((u): u is typeof u & { event: NonNullable<typeof u.event> } =>
      Boolean(u.event),
    );

  const next = registrations[0];
  const days = daysUntil(next.event.date);

  // Recommended: races the runner has not registered for, most popular first.
  const registeredSlugs = new Set(registrations.map((r) => r.eventSlug));
  const recommended = events
    .filter((e) => !registeredSlugs.has(e.slug))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      {/* Greeting -------------------------------------------------------- */}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-line pb-8">
        <div>
          <Eyebrow>{fmt.longDate("2026-08-25")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
            {t("dashboard.greeting", { name: runner.name.split(" ")[0] })}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-3 text-[15px] text-fg-dim">
            {t("dashboard.daysToStart", { days: fmt.number(days) })}
          </p>
        </div>
        <div className="flex gap-3">
          <Button href="/events" variant="outline" size="md">
            {t("dashboard.findRace")}
          </Button>
          <Button href={`/runners/${runner.id}`} size="md">
            {t("dashboard.myProfile")}
          </Button>
        </div>
      </header>

      {/* Season stats ---------------------------------------------------- */}
      <section
        aria-label={t("dashboard.seasonSummary")}
        className="grid grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <StatCard
          value={runner.stats.races}
          label={t("dashboard.racesThisYear")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(runner.stats.kmRaced)}
          suffix="km"
          label={t("dashboard.distanceRaced")}
          accent="lime"
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.podiums}
          label={t("dashboard.podiums")}
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.personalBests}
          label={t("dashboard.personalBests")}
          accent="yellow"
          className="bg-ink"
        />
      </section>

      {/* Next race ------------------------------------------------------- */}
      <section className="py-12">
        <SectionHeading
          title={t("dashboard.nextRace")}
          kicker={t("dashboard.nextRaceKicker")}
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative overflow-hidden border-2 border-neon-yellow bg-neon-yellow/6 p-6 sm:p-9">
            <div aria-hidden="true" className="bg-road-lines absolute inset-0" />
            <div className="relative">
              <p className="font-display text-2xl font-black tracking-[0.06em] text-neon-yellow uppercase sm:text-3xl">
                {t("dashboard.daysToRaceDay", { days: fmt.number(days) })}
              </p>
              <h3 className="mt-4 font-display text-4xl leading-tight font-black uppercase sm:text-5xl">
                {next.event.name}
              </h3>

              <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                    {t("dashboard.date")}
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-bold">
                    {next.event.dow} {next.event.day} {next.event.month}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                    {t("dashboard.start")}
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-bold">
                    {fmt.clock(next.event.startTime)}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                    {t("dashboard.category")}
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-bold">
                    {distanceLabel(t, next.category)} ·{" "}
                    {waveLabel(t, next.wave)}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                    {t("dashboard.bib")}
                  </dt>
                  <dd className="mt-1.5 font-mono text-[15px] font-bold text-neon-lime">
                    #{next.bib}
                  </dd>
                </div>
              </dl>

              <p className="mt-6 text-sm text-fg-muted">
                {next.event.venue} · {next.event.city}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button href={`/events/${next.event.slug}`} size="lg">
                  {t("dashboard.viewRegistration")}
                </Button>
                <Button
                  href={`/events/${next.event.slug}`}
                  variant="outline"
                  size="lg"
                >
                  {t("dashboard.raceInformation")}
                </Button>
              </div>
            </div>
          </div>

          {/* Upcoming registrations */}
          <div className="border-2 border-line">
            <div className="border-b-2 border-line px-5 py-4">
              <Eyebrow>{t("dashboard.alsoRegistered")}</Eyebrow>
            </div>
            <ul>
              {registrations.slice(1).map((r) => (
                <li
                  key={r.eventSlug}
                  className="border-b-2 border-line px-5 py-5 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <Link
                      href={`/events/${r.event.slug}`}
                      className="font-display text-lg font-black uppercase hover:text-neon-lime"
                    >
                      {r.event.name}
                    </Link>
                    <span className="shrink-0 font-mono text-[12px] text-fg-dim">
                      {r.event.day} {r.event.month}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                    {t("dashboard.registrationMeta", {
                      category: distanceLabel(t, r.category),
                      wave: waveLabel(t, r.wave),
                      bib: r.bib,
                    })}
                  </p>
                  <p className="mt-2 text-xs text-fg-dim">
                    {t("dashboard.daysAway", {
                      days: fmt.number(daysUntil(r.event.date)),
                    })}
                  </p>
                </li>
              ))}
            </ul>
            <div className="p-5">
              <Button href="/events" variant="outline" block size="md">
                {t("dashboard.addAnotherRace")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Saved events ---------------------------------------------------- */}
      <section id="saved" className="scroll-mt-24 py-6">
        <SectionHeading
          title={t("dashboard.savedEvents")}
          kicker={t("dashboard.savedKicker")}
          href="/events"
          hrefLabel={t("dashboard.findMore")}
        />
        <div className="mt-8">
          <SavedEventsPanel events={events} />
        </div>
      </section>

      {/* Recent results -------------------------------------------------- */}
      <section className="py-12">
        <SectionHeading
          title={t("dashboard.recentResults")}
          kicker={t("dashboard.recentResultsKicker")}
          href={`/runners/${runner.id}`}
          hrefLabel={t("dashboard.fullRaceHistory")}
        />
        <ul className="mt-6 border-t-2 border-line">
          {runner.results.slice(0, 3).map((r) => (
            <li
              key={r.eventName + r.date}
              className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b-2 border-line py-5"
            >
              <div className="min-w-52 flex-1">
                <p className="font-display text-lg font-black uppercase">
                  {r.eventName}
                </p>
                <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                  {r.date} · {distanceLabel(t, r.distance)}
                </p>
              </div>
              <div>
                <Eyebrow>{t("dashboard.time")}</Eyebrow>
                <p
                  className={
                    r.personalBest
                      ? "mt-1 font-mono text-xl text-neon-lime"
                      : "mt-1 font-mono text-xl"
                  }
                >
                  {r.time}
                </p>
              </div>
              <div>
                <Eyebrow>{t("dashboard.pace")}</Eyebrow>
                <p className="mt-1 font-mono text-xl">{r.pace}</p>
              </div>
              <div>
                <Eyebrow>{t("dashboard.overall")}</Eyebrow>
                <p className="mt-1 font-mono text-xl">
                  {r.overallPlace} / {r.overallField}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.personalBest ? (
                  <Badge tone="lime">{t("dashboard.pb")}</Badge>
                ) : null}
                {r.podium ? (
                  <Badge tone="yellow">{t("dashboard.podium")}</Badge>
                ) : null}
              </div>
              <Button
                href={`/events/${r.eventSlug}/results`}
                variant="outline"
                size="sm"
              >
                {t("dashboard.viewResults")}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Recommended ----------------------------------------------------- */}
      <section className="py-6 pb-14">
        <SectionHeading
          title={t("dashboard.recommended")}
          kicker={t("dashboard.recommendedKicker", { club: runner.club })}
          href="/events"
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recommended.map((event) => (
            <EventCardCompact key={event.id} event={event} />
          ))}
        </div>
      </section>
    </div>
  );
}

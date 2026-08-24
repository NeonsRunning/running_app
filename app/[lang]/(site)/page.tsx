import { BrandTagline } from "@/components/brand/logo";
import { Link } from "@/components/i18n/link";
import { EventCardCompact, EventRow } from "@/components/events/event-card";
import { RaceSearch } from "@/components/events/race-search";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import { getClubs, getCommunityFeed, getEvents } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";

export default async function LandingPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const events = getEvents(locale);
  const clubs = getClubs(locale);
  const communityFeed = getCommunityFeed(locale);
  const featured = events.slice(0, 3);

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(115deg,#050505_0%,#050505_52%,#0d2207_74%,#245200_92%,#4f9c00_112%)]"
        />
        <div aria-hidden="true" className="bg-road-lines absolute inset-0" />
        {/* GPS route ring, echoing the badge in the brand artwork. */}
        <div
          aria-hidden="true"
          className="absolute -right-24 -bottom-32 h-136 w-136 rounded-full border-2 border-neon-lime/35"
        />
        <div
          aria-hidden="true"
          className="absolute right-10 -bottom-10 h-88 w-88 rounded-full border-2 border-neon-yellow/20"
        />

        <div className="relative mx-auto max-w-[1600px] px-4 pt-16 pb-14 sm:px-6 sm:pt-20 lg:px-10 lg:pt-24 lg:pb-20">
          <BrandTagline />

          <h1 className="mt-6 max-w-4xl font-display text-[3.25rem] leading-[0.88] font-black tracking-[-0.04em] uppercase sm:text-7xl lg:text-[7rem]">
            {t("home.heroTitleLine1")}
            <br />
            <span className="text-neon-yellow">{t("home.heroTitleLine2")}</span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            {t("home.heroBody")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button href="/events" size="xl">
              {t("home.exploreEvents")}
            </Button>
            <Button href="/results" variant="outline" size="xl">
              {t("home.viewResults")}
            </Button>
          </div>
        </div>

        {/* Race search sits on the hero's lower edge, the way a search bar
            does on a booking site — the first thing a returning runner needs. */}
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
          <RaceSearch />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Platform stats                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-label={t("home.statsLabel")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 border-b-2 border-line lg:grid-cols-4"
      >
        <StatCard
          value={fmt.number(184)}
          label={t("home.statsRaces")}
          accent="yellow"
          className="border-r-2 border-b-2 border-line lg:border-b-0"
        />
        <StatCard
          value={fmt.number(26410)}
          label={t("home.statsRunners")}
          className="border-b-2 border-line lg:border-r-2 lg:border-b-0"
        />
        <StatCard
          value={fmt.number(62)}
          label={t("home.statsOrganizers")}
          className="border-r-2 border-line"
        />
        <StatCard value={fmt.number(31)} label={t("home.statsClubs")} />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Upcoming races                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
        <SectionHeading
          title={t("home.upcomingTitle")}
          kicker={t("home.upcomingKicker")}
          href="/events"
          hrefLabel={t("home.upcomingHrefLabel")}
        />

        {/* Desktop and tablet: full-width horizontal rows. */}
        <div className="hidden border-b-2 border-line sm:block">
          {featured.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>

        {/* Mobile: a swipeable rail, not a squashed row. */}
        <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:hidden">
          {events.slice(0, 5).map((event) => (
            <EventCardCompact
              key={event.id}
              event={event}
              className="w-68 shrink-0 snap-start"
            />
          ))}
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase sm:hidden">
          {t("home.swipeForMore")}
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Community strip                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y-2 border-line bg-carbon">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <SectionHeading
            title={t("home.communityTitle")}
            kicker={t("home.communityKicker")}
            href="/community"
            hrefLabel={t("home.communityHrefLabel")}
          />

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h3 className="font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase">
                {t("home.recentAchievements")}
              </h3>
              <ul className="mt-5 flex flex-col">
                {communityFeed.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-4 border-b-2 border-line py-4 last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        item.tone === "lime"
                          ? "flex h-11 w-11 shrink-0 items-center justify-center bg-linear-to-br from-neon-lime to-neon-green text-xs font-black text-ink"
                          : item.tone === "yellow"
                            ? "flex h-11 w-11 shrink-0 items-center justify-center bg-graphite text-xs font-black text-neon-yellow"
                            : "flex h-11 w-11 shrink-0 items-center justify-center bg-graphite text-xs font-black text-neon-green"
                      }
                    >
                      {item.initials}
                    </span>
                    <p className="text-sm leading-relaxed text-fg-muted">
                      <span className="font-bold text-fg">{item.name}</span>{" "}
                      {item.text}
                      <span className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
                        {item.time}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase">
                {t("home.clubsNearYou")}
              </h3>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {clubs.map((club) => (
                  <li
                    key={club.id}
                    className="border-2 border-line bg-ink p-4 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 items-center justify-center border-2 border-line-strong text-[11px] font-black text-neon-lime"
                      >
                        {club.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold uppercase">
                          {club.name}
                        </p>
                        <p className="font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
                          {club.city} ·{" "}
                          {t("home.clubMembers", { count: club.members })}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-fg-dim">{club.focus}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Organizer CTA — the one place the accent runs as a full field.    */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-neon-lime text-ink">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:px-10 lg:py-16">
          <div className="flex-1">
            <p className="font-mono text-[12px] tracking-[0.2em] uppercase">
              {t("home.organizerKicker")}
            </p>
            <h2 className="mt-4 font-display text-4xl leading-[0.92] font-black tracking-[-0.035em] uppercase sm:text-5xl lg:text-6xl">
              {t("home.organizerTitleLine1")}
              <br />
              {t("home.organizerTitleLine2")}
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-ink/75">
              {t("home.organizerBody")}
            </p>
          </div>
          <Link
            href="/publish"
            className="inline-flex shrink-0 items-center justify-center bg-ink px-9 py-6 text-sm font-black tracking-[0.12em] text-neon-lime uppercase transition-colors hover:bg-charcoal"
          >
            {t("nav.publishEvent")}
          </Link>
        </div>
      </section>
    </>
  );
}

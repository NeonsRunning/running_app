import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { notFound } from "next/navigation";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { FollowButton } from "@/components/profile/follow-button";
import { ShareRow } from "@/components/events/share-row";
import { cn } from "@/lib/cn";
import {
  RUNNERS,
  daysUntil,
  getEventBySlug,
  getRunner,
} from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel, waveLabel } from "@/lib/i18n/labels";

export function generateStaticParams() {
  return RUNNERS.map((r) => ({ handle: r.handle }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/runners/[handle]">,
): Promise<Metadata> {
  const { handle } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const runner = getRunner(handle, locale);
  if (!runner) return { title: t("runner.notFound") };
  return { title: runner.name, description: runner.bio };
}

export default async function RunnerProfilePage(
  props: PageProps<"/[lang]/runners/[handle]">,
) {
  const { handle } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const runner = getRunner(handle, locale);
  if (!runner) notFound();

  const next = runner.upcoming[0];
  const nextEvent = next ? getEventBySlug(next.eventSlug, locale) : undefined;

  return (
    <div>
      {/* Profile header -------------------------------------------------- */}
      <header className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(100deg,rgba(156,255,0,0.05)_0_2px,transparent_2px_40px)]"
        />
        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-7 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:gap-9 lg:px-10 lg:py-14">
          {/* Photo placeholder — the runner's own image would sit here. */}
          <div
            aria-hidden="true"
            className="relative h-28 w-28 shrink-0 overflow-hidden bg-gradient-to-br from-[#123300] to-neon-lime sm:h-44 sm:w-44"
          >
            <div className="bg-track-lanes absolute inset-0 opacity-40" />
            <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-ink/70 sm:text-6xl">
              {runner.initials}
            </span>
          </div>

          <div className="flex-1">
            <p className="font-mono text-[11px] tracking-[0.2em] text-neon-lime uppercase">
              {t("runner.clubLine", {
                city: runner.city,
                club: runner.club,
              })}
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black tracking-[-0.04em] uppercase sm:text-6xl lg:text-7xl">
              {runner.name}
            </h1>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-fg-dim sm:text-base">
              {runner.bio}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-56">
            <FollowButton name={runner.name} block />
            <ShareRow
              title={`${runner.name} on NEONS RUNNING`}
              path={`/runners/${runner.handle}`}
            />
            <p className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
              {t("runner.followers", {
                followers: fmt.number(runner.followers),
                following: fmt.number(runner.following),
              })}
            </p>
          </div>
        </div>
      </header>

      {/* Stats ------------------------------------------------------------ */}
      <section
        aria-label={t("runner.careerStats")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <StatCard
          value={runner.stats.races}
          label={t("runner.races")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(runner.stats.kmRaced)}
          suffix="km"
          label={t("runner.raced")}
          accent="lime"
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.podiums}
          label={t("runner.podiums")}
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.personalBests}
          label={t("runner.personalBests")}
          accent="yellow"
          className="bg-ink"
        />
      </section>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[1fr_400px]">
        <main className="border-line lg:border-r-2">
          {/* Achievements ------------------------------------------------ */}
          <section className="border-b-2 border-line px-4 py-10 sm:px-8 lg:px-10">
            <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
              {t("runner.achievements")}
            </h2>
            <ul className="mt-6 grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-3">
              {runner.achievements.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-center gap-4 p-5",
                    a.isNew
                      ? "animate-pop-in bg-neon-yellow/8 shadow-[inset_0_0_0_2px_#FFF200]"
                      : a.earned
                        ? "bg-carbon"
                        : "bg-carbon opacity-45",
                  )}
                >
                  <span aria-hidden="true" className="text-2xl">
                    {a.emoji}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[15px] font-extrabold uppercase",
                        a.isNew && "text-neon-yellow",
                      )}
                    >
                      {a.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-dim">
                      {a.earned
                        ? a.detail
                        : t("runner.locked", { detail: a.detail })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Race history ------------------------------------------------ */}
          <section className="px-4 py-10 sm:px-8 lg:px-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                {t("runner.raceHistory")}
              </h2>
              <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
                {t("runner.raceHistoryMeta", { count: runner.stats.races })}
              </span>
            </div>

            <ul className="mt-6 border-t-2 border-line">
              {runner.results.map((r) => (
                <li
                  key={r.eventName + r.date}
                  className="border-b-2 border-line py-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-xl font-black uppercase">
                        {r.eventName}
                      </h3>
                      <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                        {r.date} · {distanceLabel(t, r.distance)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.personalBest ? (
                        <Badge tone="lime">{t("runner.pb")}</Badge>
                      ) : null}
                      {r.podium ? (
                        <Badge tone="yellow">{t("runner.podium")}</Badge>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                    <div>
                      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                        {t("runner.officialTime")}
                      </dt>
                      <dd
                        className={cn(
                          "mt-1.5 font-mono text-xl",
                          r.personalBest
                            ? "text-neon-lime"
                            : r.podium
                              ? "text-neon-yellow"
                              : "text-fg",
                        )}
                      >
                        {r.time}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                        {t("runner.pace")}
                      </dt>
                      <dd className="mt-1.5 font-mono text-xl">{r.pace}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                        {t("runner.overall")}
                      </dt>
                      <dd className="mt-1.5 font-mono text-xl">
                        {r.overallPlace} / {r.overallField}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                        {t("runner.ageGroup")}
                      </dt>
                      <dd className="mt-1.5 font-mono text-xl">
                        {r.agePlace} / {r.ageField}
                      </dd>
                    </div>
                  </dl>

                  <Button
                    href={`/events/${r.eventSlug}/results`}
                    variant="outline"
                    size="sm"
                    className="mt-5"
                  >
                    {t("runner.viewResults")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <aside className="border-t-2 border-line lg:border-t-0">
          {nextEvent ? (
            <div className="border-b-2 border-line px-5 py-7 sm:px-7">
              <Eyebrow>{t("runner.nextRace")}</Eyebrow>
              <div className="mt-4 border-2 border-neon-yellow bg-neon-yellow/6 p-5">
                <p className="font-display text-[15px] font-black tracking-[0.1em] text-neon-yellow uppercase">
                  {t("runner.daysToRaceDay", {
                    days: fmt.number(daysUntil(nextEvent.date)),
                  })}
                </p>
                <h3 className="mt-3.5 font-display text-2xl leading-tight font-black uppercase">
                  {nextEvent.name}
                </h3>
                <dl className="mt-4 flex flex-col gap-2 text-sm text-fg-muted">
                  <div className="flex justify-between">
                    <dt className="text-fg-dim">{t("runner.date")}</dt>
                    <dd>
                      {nextEvent.dow}, {nextEvent.month} {nextEvent.day}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-dim">{t("runner.start")}</dt>
                    <dd>
                      {fmt.clock(nextEvent.startTime)} ·{" "}
                      {waveLabel(t, next.wave)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-dim">{t("runner.bib")}</dt>
                    <dd className="font-mono">#{next.bib}</dd>
                  </div>
                </dl>
                <Button
                  href={`/events/${nextEvent.slug}`}
                  block
                  size="md"
                  className="mt-5"
                >
                  {t("runner.viewRegistration")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="border-b-2 border-line px-5 py-7 sm:px-7">
            <Eyebrow>{t("runner.upcoming")}</Eyebrow>
            <ul className="mt-4">
              {runner.upcoming.slice(1).map((u) => {
                const ev = getEventBySlug(u.eventSlug, locale);
                if (!ev) return null;
                return (
                  <li
                    key={u.eventSlug}
                    className="flex items-baseline justify-between gap-3 border-b-2 border-line py-3.5 last:border-b-0"
                  >
                    <Link
                      href={`/events/${ev.slug}`}
                      className="text-[15px] font-bold hover:text-neon-lime"
                    >
                      {ev.name}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-fg-dim">
                      {ev.day} {ev.month}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="px-5 py-7 sm:px-7">
            <Eyebrow>{t("runner.personalBestsPanel")}</Eyebrow>
            <ul className="mt-4">
              {runner.personalBests.map((pb) => (
                <li
                  key={pb.distance}
                  className="flex justify-between border-b-2 border-line py-3.5 last:border-b-0"
                >
                  <span className="text-[15px] font-bold">
                    {distanceLabel(t, pb.distance)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[17px]",
                      pb.fresh ? "text-neon-lime" : "text-fg-dim",
                    )}
                  >
                    {pb.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

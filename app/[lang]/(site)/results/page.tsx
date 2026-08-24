import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { LEADERBOARD, getEvents } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("results.index.metaTitle"),
    description: t("results.index.metaDescription"),
  };
}

export default async function ResultsIndexPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  // In the demo, results exist for races that have already been run.
  const withResults = getEvents(locale).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>{t("results.index.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
          {t("results.index.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] text-fg-dim">
          {t("results.index.body")}
        </p>
      </header>

      <section className="py-10">
        <SectionHeading
          title={t("results.index.latestRaces")}
          kicker={t("results.index.season")}
        />
        <ul className="mt-6 border-t-2 border-line">
          {withResults.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b-2 border-line py-6"
            >
              <div className="min-w-56 flex-1">
                <h2 className="font-display text-2xl font-black uppercase">
                  <Link href={`/events/${e.slug}/results`} className="hover:text-neon-lime">
                    {e.name}
                  </Link>
                </h2>
                <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                  {e.dow} {e.day} {e.month} {e.year} · {e.city}
                </p>
              </div>
              <div>
                <Eyebrow>{t("results.index.finishers")}</Eyebrow>
                <p className="mt-1 font-mono text-lg">
                  {fmt.number(e.registered)}
                </p>
              </div>
              <div>
                <Eyebrow>{t("results.index.winningTime")}</Eyebrow>
                <p className="mt-1 font-mono text-lg text-neon-yellow">
                  {LEADERBOARD[0].time}
                </p>
              </div>
              <Badge tone="green">{t("results.index.resultsPosted")}</Badge>
              <Button href={`/events/${e.slug}/results`} variant="outline" size="sm">
                {t("results.index.viewLeaderboard")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

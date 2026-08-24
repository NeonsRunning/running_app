import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { RUNNERS, getClubs, getCommunityFeed } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("community.metaTitle"),
    description: t("community.metaDescription"),
  };
}

const POPULAR = [
  { handle: "alex-rivera", name: "Alex Rivera", initials: "AR", city: "San Juan", stat: "24:38 5K", followers: 418 },
  { handle: "alex-rivera", name: "Keila Santana", initials: "KS", city: "Dorado", stat: "32:48 10K", followers: 1204 },
  { handle: "alex-rivera", name: "Andrés Maldonado", initials: "AM", city: "Caguas", stat: "31:04 10K", followers: 2810 },
  { handle: "alex-rivera", name: "María Colón", initials: "MC", city: "Bayamón", stat: "1:52:10 Half", followers: 306 },
];

export default async function CommunityPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const runner = RUNNERS[0];
  const clubs = getClubs(locale);
  const communityFeed = getCommunityFeed(locale);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>Corremos · Superamos · Inspiramos</Eyebrow>
        <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
          {t("community.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("community.body")}
        </p>
      </header>

      {/* Clubs ----------------------------------------------------------- */}
      <section className="py-12">
        <SectionHeading
          title={t("community.clubs")}
          kicker={t("community.clubsKicker")}
        />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {clubs.map((club) => (
            <li
              key={club.id}
              className="flex flex-col border-2 border-line bg-carbon p-5 transition-colors hover:border-line-strong"
            >
              <div className="flex items-center gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line-strong text-sm font-black text-neon-lime"
                >
                  {club.initials}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-black uppercase">
                    {club.name}
                  </h3>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
                    {club.city}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-[13px] text-fg-dim">{club.focus}</p>
              <div className="mt-5 flex items-center justify-between border-t-2 border-line pt-4">
                <span className="font-mono text-[11px] text-fg-dim">
                  {t("community.members", {
                    count: fmt.number(club.members),
                  })}
                </span>
                <Button href="/community" variant="outline" size="sm">
                  {t("community.join")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-10 border-t-2 border-line py-12 lg:grid-cols-2 lg:gap-14">
        {/* Popular runners ----------------------------------------------- */}
        <section>
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {t("community.popularRunners")}
          </h2>
          <ul className="mt-6 border-t-2 border-line">
            {POPULAR.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-4 border-b-2 border-line py-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center bg-graphite text-sm font-black text-fg-dim"
                >
                  {p.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/runners/${p.handle}`}
                    className="text-base font-bold hover:text-neon-lime"
                  >
                    {p.name}
                  </Link>
                  <p className="font-mono text-[11px] tracking-[0.1em] text-fg-faint uppercase">
                    {p.city} ·{" "}
                    {t("community.followers", {
                      count: fmt.number(p.followers),
                    })}
                  </p>
                </div>
                <Badge tone="lime">{p.stat}</Badge>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent achievements ------------------------------------------- */}
        <section>
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {t("community.recentAchievements")}
          </h2>
          <ul className="mt-6 border-t-2 border-line">
            {communityFeed.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-4 border-b-2 border-line py-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center bg-graphite text-xs font-black text-neon-lime"
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

          <div className="mt-8 border-2 border-line bg-carbon p-6">
            <Eyebrow>{t("community.yourSeason")}</Eyebrow>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              {t("community.seasonSummary", {
                races: runner.stats.races,
                km: fmt.number(runner.stats.kmRaced),
                pbs: runner.stats.personalBests,
              })}
            </p>
            <Button
              href={`/runners/${runner.handle}`}
              variant="outline"
              size="md"
              className="mt-5"
            >
              {t("community.viewProfile")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

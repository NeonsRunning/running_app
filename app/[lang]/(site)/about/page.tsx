import type { Metadata } from "next";
import { BrandTagline, NeonsMark } from "@/components/brand/logo";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import { getPlatformStats } from "@/lib/events/queries";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { pageAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("about.metaTitle"),
    description: t("about.metaDescription"),
    alternates: await pageAlternates("/about"),
  };
}

const EXPERIENCES = [
  { title: "about.experiences.virtual", body: "about.experiences.virtualBody" },
  { title: "about.experiences.medals", body: "about.experiences.medalsBody" },
  {
    title: "about.experiences.community",
    body: "about.experiences.communityBody",
  },
  {
    title: "about.experiences.everyone",
    body: "about.experiences.everyoneBody",
  },
];

const VALUES = [
  { title: "about.values.discipline", body: "about.values.disciplineBody" },
  { title: "about.values.perseverance", body: "about.values.perseveranceBody" },
  { title: "about.values.unity", body: "about.values.unityBody" },
  { title: "about.values.respect", body: "about.values.respectBody" },
  { title: "about.values.inclusion", body: "about.values.inclusionBody" },
  { title: "about.values.passion", body: "about.values.passionBody" },
];

const PROSE =
  "max-w-[68ch] space-y-5 text-base leading-relaxed text-fg-muted sm:text-[17px]";

export default async function AboutPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);
  const stats = await getPlatformStats();

  return (
    <div>
      <header className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(120deg,#050505_0%,#050505_56%,#0d2207_80%,#2c6600_112%)]"
        />
        <div aria-hidden="true" className="bg-road-lines absolute inset-0" />
        <div className="relative mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <NeonsMark size={72} />
          <Eyebrow className="mt-8 text-neon-lime">{t("about.eyebrow")}</Eyebrow>
          <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[0.9] font-black tracking-[-0.035em] text-balance uppercase sm:text-6xl lg:text-7xl">
            {t("about.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">
            {t("about.lede")}
          </p>
          <BrandTagline className="mt-8" />
        </div>
      </header>

      <section
        aria-label={t("about.glance")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <StatCard value="2026" label={t("about.founded")} className="bg-ink" />
        <StatCard
          value={fmt.number(stats.races)}
          label={t("about.racesListed")}
          accent="yellow"
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(stats.runners)}
          label={t("about.runnersRegistered")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(stats.organizers)}
          label={t("about.organizers")}
          accent="lime"
          className="bg-ink"
        />
      </section>

      <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10">
        <section>
          <SectionHeading
            title={t("about.whoTitle")}
            kicker={t("about.whoKicker")}
          />
          <div className={`mt-8 ${PROSE}`}>
            <p>{t("about.who1")}</p>
            <p>{t("about.who2")}</p>
            <p>{t("about.who3")}</p>
            <p className="font-semibold text-fg">{t("about.who4")}</p>
          </div>
        </section>

        <section className="mt-16 grid gap-0.5 bg-line md:grid-cols-2">
          {(
            [
              ["missionTitle", "mission1", "mission2", "border-neon-lime"],
              ["visionTitle", "vision1", "vision2", "border-neon-yellow"],
            ] as const
          ).map(([title, p1, p2, accent]) => (
            <div
              key={title}
              className={`border-t-4 ${accent} bg-carbon p-6 sm:p-8`}
            >
              <h2 className="font-display text-2xl font-black uppercase sm:text-3xl">
                {t(`about.${title}`)}
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-fg-muted">
                <p>{t(`about.${p1}`)}</p>
                <p>{t(`about.${p2}`)}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <SectionHeading
            title={t("about.experiencesTitle")}
            kicker={t("about.experiencesKicker")}
          />
          <div className={`mt-8 ${PROSE}`}>
            <p>{t("about.experiences1")}</p>
            <p>{t("about.experiences2")}</p>
          </div>
          <ul className="mt-8 grid gap-0.5 bg-line sm:grid-cols-2">
            {EXPERIENCES.map((e) => (
              <li key={e.title} className="bg-carbon p-6">
                <h3 className="font-display text-xl font-black uppercase">
                  {t(e.title)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-fg-dim">
                  {t(e.body)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <SectionHeading
            title={t("about.valuesTitle")}
            kicker={t("about.valuesKicker")}
          />
          <ul className="mt-8 grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((v) => (
              <li key={v.title} className="bg-carbon p-6">
                <h3 className="font-display text-xl font-black text-neon-lime uppercase">
                  {t(v.title)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-fg-dim">
                  {t(v.body)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 border-t-2 border-line pt-12">
          <Eyebrow>{t("about.philosophyKicker")}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-black uppercase sm:text-4xl lg:text-5xl">
            {t("about.philosophyTitle")}
          </h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div className={PROSE}>
              <p>{t("about.philosophy1")}</p>
              <p>{t("about.philosophy2")}</p>
              <p>{t("about.philosophy3")}</p>
            </div>
            <p className="font-display text-2xl leading-tight font-black uppercase sm:text-3xl">
              <span className="block">{t("about.philosophyKm")}</span>
              <span className="block text-neon-lime">
                {t("about.philosophyEffort")}
              </span>
              <span className="block text-neon-yellow">
                {t("about.philosophyGoal")}
              </span>
            </p>
          </div>
        </section>

        <section className="mt-16 border-t-2 border-line pt-12">
          <h2 className="font-display text-3xl font-black uppercase sm:text-4xl">
            {t("about.joinTitle")}
          </h2>
          <div className={`mt-6 ${PROSE}`}>
            <p>{t("about.join1")}</p>
            <p>{t("about.join2")}</p>
            <p>{t("about.join3")}</p>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href="/events" size="lg">
              {t("about.exploreEvents")}
            </Button>
            <Button href="/contact" variant="ghost" size="lg">
              {t("about.contactTeam")}
            </Button>
          </div>

          <footer className="mt-14 border-t-2 border-line pt-8">
            <p className="font-display text-2xl font-black uppercase">
              {t("about.signoffName")}
            </p>
            <p className="mt-2 font-mono text-[12px] tracking-[0.14em] text-neon-lime uppercase">
              {t("about.signoffMotto")}
            </p>
            <p className="mt-1 font-mono text-[12px] tracking-[0.14em] text-fg-dim uppercase">
              {t("about.signoffOrigin")}
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}

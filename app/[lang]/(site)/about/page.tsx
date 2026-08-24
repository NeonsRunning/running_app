import type { Metadata } from "next";
import { BrandTagline, NeonsMark } from "@/components/brand/logo";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("about.metaTitle"),
    description: t("about.metaDescription"),
  };
}

const VALUES = [
  { title: "about.values.runnersFirst", body: "about.values.runnersFirstBody" },
  {
    title: "about.values.honestPricing",
    body: "about.values.honestPricingBody",
  },
  {
    title: "about.values.builtWhereWeRun",
    body: "about.values.builtWhereWeRunBody",
  },
];

export default async function AboutPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

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
          <h1 className="mt-8 max-w-3xl font-display text-4xl leading-[0.9] font-black tracking-[-0.035em] uppercase sm:text-6xl lg:text-7xl">
            {t("about.title")}
          </h1>
          <BrandTagline className="mt-8" />
        </div>
      </header>

      <section
        aria-label={t("about.glance")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        <StatCard value="2019" label={t("about.founded")} className="bg-ink" />
        <StatCard
          value={fmt.number(184)}
          label={t("about.racesListed")}
          accent="yellow"
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(26410)}
          label={t("about.runnersRegistered")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(62)}
          label={t("about.organizers")}
          accent="lime"
          className="bg-ink"
        />
      </section>

      <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10">
        <section>
          <SectionHeading
            title={t("about.whyTitle")}
            kicker={t("about.whyKicker")}
          />
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="max-w-[68ch] space-y-5 text-base leading-relaxed text-fg-muted sm:text-[17px]">
              <p>{t("about.story1")}</p>
              <p>{t("about.story2")}</p>
              <p className="text-fg-dim">{t("about.story3")}</p>
            </div>

            <ul className="grid gap-0.5 bg-line">
              {VALUES.map((v) => (
                <li key={v.title} className="bg-carbon p-6">
                  <h3 className="font-display text-xl font-black uppercase">
                    {t(v.title)}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-fg-dim">
                    {t(v.body)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-16 border-t-2 border-line pt-12">
          <Eyebrow>{t("about.getInTouch")}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-black uppercase sm:text-4xl">
            {t("about.runWithUs")}
          </h2>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href="/events" size="lg">
              {t("about.exploreEvents")}
            </Button>
            <Button href="/publish" variant="outline" size="lg">
              {t("about.publishEvent")}
            </Button>
            <Button href="/contact" variant="ghost" size="lg">
              {t("about.contactTeam")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

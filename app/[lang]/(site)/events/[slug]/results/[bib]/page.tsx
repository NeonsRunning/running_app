import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareRow } from "@/components/events/share-row";
import { LEADERBOARD, getEventBySlug } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/results/[bib]">,
): Promise<Metadata> {
  const { slug, bib } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const event = getEventBySlug(slug, locale);
  const row = LEADERBOARD.find((r) => r.bib === bib);
  return {
    title:
      row && event
        ? `${row.name} · ${event.name}`
        : t("results.detail.metaFallback"),
  };
}

export default async function ResultDetailPage(
  props: PageProps<"/[lang]/events/[slug]/results/[bib]">,
) {
  const { slug, bib } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const event = getEventBySlug(slug, locale);
  const row = LEADERBOARD.find((r) => r.bib === bib);
  if (!event || !row) notFound();

  const genderField = row.gender === "M" ? 281 : 247;
  const genderPlace = Math.max(1, Math.round(row.place * 0.81));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <nav aria-label={t("results.detail.breadcrumb")} className="mb-8">
        <Button href={`/events/${slug}/results`} variant="ghost" size="sm">
          {t("results.detail.backToResults")}
        </Button>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* Result ---------------------------------------------------------- */}
        <div>
          <Eyebrow>
            {event.name} · {fmt.longDate(event.date)}
          </Eyebrow>
          <h1 className="mt-3 font-display text-5xl leading-[0.9] font-black tracking-[-0.04em] uppercase sm:text-6xl">
            {row.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="neutral">
              {t("results.detail.bib", { bib: row.bib })}
            </Badge>
            <Badge tone="lime">
              {distanceLabel(t, event.featuredDistance)}
            </Badge>
            <Badge tone="outline">{row.ageGroup}</Badge>
            {row.place <= 3 ? (
              <Badge tone="yellow">{t("results.detail.podium")}</Badge>
            ) : null}
          </div>

          <div className="mt-9 border-2 border-line">
            <div className="border-b-2 border-line px-6 py-8">
              <Eyebrow>{t("results.detail.finishTime")}</Eyebrow>
              <p className="mt-2 font-display text-6xl leading-none font-black tracking-[-0.04em] text-neon-lime sm:text-7xl">
                {row.time}
              </p>
              <p className="mt-3 font-mono text-sm text-fg-dim">
                {t("results.detail.averagePace", { pace: row.pace })}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-3">
              <div className="bg-ink px-6 py-6">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                  {t("results.detail.overall")}
                </dt>
                <dd className="mt-2 font-mono text-2xl">
                  {row.place}{" "}
                  <span className="text-base text-fg-dim">/ 528</span>
                </dd>
              </div>
              <div className="bg-ink px-6 py-6">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                  {t("results.detail.gender")}
                </dt>
                <dd className="mt-2 font-mono text-2xl">
                  {genderPlace}{" "}
                  <span className="text-base text-fg-dim">/ {genderField}</span>
                </dd>
              </div>
              <div className="bg-ink px-6 py-6">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                  {t("results.detail.ageGroup")}
                </dt>
                <dd className="mt-2 font-mono text-2xl">
                  8 <span className="text-base text-fg-dim">/ 74</span>
                </dd>
              </div>
            </dl>

            <div className="border-t-2 border-line px-6 py-6">
              <Eyebrow>{t("results.detail.splits")}</Eyebrow>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {[
                  { km: "2.5 K", t: "12:02" },
                  { km: "5 K", t: "24:11" },
                  { km: "7.5 K", t: "36:20" },
                  { km: t("results.detail.finish"), t: row.time },
                ].map((s) => (
                  <li key={s.km}>
                    <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                      {s.km}
                    </p>
                    <p className="mt-1 font-mono text-lg">{s.t}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Share card ------------------------------------------------------ */}
        <aside>
          <Eyebrow>{t("results.detail.shareCard")}</Eyebrow>

          <div className="relative mt-4 aspect-9/16 overflow-hidden border-2 border-line">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(160deg,#050505_0%,#123300_58%,#49FF18_130%)]"
            />
            <div aria-hidden="true" className="bg-road-lines absolute inset-0" />
            <div
              aria-hidden="true"
              className="absolute -right-16 -bottom-20 h-72 w-72 rounded-full border-2 border-neon-lime/30"
            />

            <div className="relative flex h-full flex-col justify-between p-6">
              <div>
                <p className="font-mono text-[10px] tracking-[0.22em] text-neon-lime uppercase">
                  Neons Running
                </p>
                <p className="mt-4 font-display text-2xl leading-tight font-black uppercase">
                  {event.name}
                </p>
                <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-fg-muted uppercase">
                  {event.dow} {event.day} {event.month} {event.year}
                </p>
              </div>

              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-fg-muted uppercase">
                  {t("results.detail.finishTime")}
                </p>
                <p className="mt-1 font-display text-6xl leading-none font-black tracking-[-0.04em] text-neon-yellow">
                  {row.time}
                </p>
                <p className="mt-4 font-display text-xl font-black uppercase">
                  {row.name}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-white/20 pt-4">
                  <div>
                    <p className="font-mono text-[9px] tracking-[0.14em] text-fg-muted uppercase">
                      {t("results.detail.pace")}
                    </p>
                    <p className="mt-0.5 font-mono text-sm">{row.pace}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[0.14em] text-fg-muted uppercase">
                      {t("results.detail.overall")}
                    </p>
                    <p className="mt-0.5 font-mono text-sm">{row.place}/528</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[0.14em] text-fg-muted uppercase">
                      {t("results.detail.bibShort")}
                    </p>
                    <p className="mt-0.5 font-mono text-sm">#{row.bib}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ShareRow
            title={t("results.detail.shareTitle", {
              name: row.name,
              time: row.time,
              event: event.name,
            })}
            path={`/events/${slug}/results/${bib}`}
            className="mt-4"
          />
          <Button block size="lg" className="mt-3">
            {t("results.detail.downloadShareCard")}
          </Button>
        </aside>
      </div>
    </div>
  );
}

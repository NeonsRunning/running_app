import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/components/i18n/link";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { findEvent } from "@/lib/events/queries";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import { formatFinishTime, formatPace } from "@/lib/results/evidence";
import { listPublicEventResults, type PublicResultRow } from "@/lib/results/queries";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/results">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const found = await findEvent(slug, locale);
  const rows = found ? await listPublicEventResults(found.event.id) : [];
  return {
    title: found
      ? t("results.metaTitle", { event: found.event.name })
      : t("results.metaTitleFallback"),
    // Nothing worth indexing until someone's result is listed.
    robots: rows.length ? undefined : NOINDEX,
  };
}

const COLUMNS = ["place", "bib", "runner", "time", "pace"] as const;

export default async function EventResultsPage(
  props: PageProps<"/[lang]/events/[slug]/results">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const found = await findEvent(slug, locale);
  if (!found) notFound();
  const { event } = found;

  // One table per distance, in the event's own order, which the rows
  // already come in.
  const rows = await listPublicEventResults(event.id);
  const byCategory = new Map<string, PublicResultRow[]>();
  for (const r of rows) {
    byCategory.set(r.categoryId, [...(byCategory.get(r.categoryId) ?? []), r]);
  }

  return (
    <div>
      <header className="border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto max-w-[1600px]">
          <Eyebrow>{fmt.longDate(event.date)}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
            {t("results.heading", { event: event.name })}
          </h1>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href={`/events/${event.slug}`} variant="outline" size="md">
              {t("results.raceInformation")}
            </Button>
            <Button href="/results" variant="ghost" size="md">
              {t("results.allResults")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10">
        {rows.length === 0 ? (
          <EmptyState
            icon="⏱"
            title={t("results.emptyTitle")}
            body={t("results.emptyBody")}
          />
        ) : (
          <>
            <p className="max-w-3xl text-[14px] leading-relaxed text-fg-dim">
              {t("results.listedNote")}
            </p>
            {[...byCategory.values()].map((group) => (
              <section key={group[0].categoryId} className="mt-10">
                <h2 className="flex flex-wrap items-baseline gap-x-4 font-display text-2xl font-black uppercase">
                  {distanceLabel(t, group[0].distance)}
                  <span className="font-mono text-[11px] tracking-[0.14em] text-fg-dim">
                    {t("results.finishers", { count: fmt.number(group.length) })}
                  </span>
                </h2>
                <div className="mt-4 overflow-x-auto border-2 border-line">
                  <table className="w-full min-w-[36rem] border-collapse">
                    <thead>
                      <tr className="border-b-2 border-line">
                        {COLUMNS.map((col) => (
                          <th
                            key={col}
                            scope="col"
                            className="px-4 py-3 text-left font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
                          >
                            {t(`results.columns.${col}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((r) => (
                        <tr key={r.id} className="border-b-2 border-line last:border-b-0">
                          <td className="px-4 py-3 font-display text-lg font-black tabular-nums">
                            {fmt.number(r.place)}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm tabular-nums text-fg-dim">
                            {r.bib}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/runners/${r.runnerId}`}
                              className="text-sm font-bold break-words hover:text-neon-lime"
                            >
                              {r.runnerName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-sm tabular-nums">
                            {formatFinishTime(r.finishSeconds)}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm tabular-nums text-fg-dim">
                            {formatPace(r.finishSeconds, r.distanceKm)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

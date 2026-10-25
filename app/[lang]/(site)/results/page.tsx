import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Eyebrow } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import { listResultEvents } from "@/lib/results/queries";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const events = await listResultEvents();
  return {
    title: t("results.index.metaTitle"),
    description: t("results.index.metaDescription"),
    // An empty state is nothing worth indexing.
    robots: events.length ? undefined : NOINDEX,
  };
}

export default async function ResultsIndexPage() {
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);
  // Newest race first.
  const events = await listResultEvents();

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

      {events.length === 0 ? (
        <EmptyState
          title={t("results.index.emptyTitle")}
          body={t("results.index.emptyBody")}
          action={{ label: t("results.index.emptyAction"), href: "/events" }}
          className="mt-10"
        />
      ) : (
        <ul className="mt-10 border-2 border-line">
          {events.map((e) => (
            <li key={e.id} className="border-b-2 border-line last:border-b-0">
              <Link
                href={`/events/${e.slug}/results`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-5 transition-colors hover:bg-carbon sm:px-7"
              >
                <span className="min-w-0">
                  <span className="block font-display text-xl font-black break-words uppercase sm:text-2xl">
                    {e.name}
                  </span>
                  <span className="mt-1 block font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                    {[
                      e.date ? fmt.mediumDate(e.date) : null,
                      e.anywhere
                        ? t("events.anywhere.place", { region: e.region })
                        : [e.city, e.region].filter(Boolean).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] text-neon-lime uppercase">
                  {t("results.finishers", { count: fmt.number(e.finishers) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

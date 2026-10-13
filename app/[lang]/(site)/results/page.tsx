import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("results.index.metaTitle"),
    description: t("results.index.metaDescription"),
  };
}

export default async function ResultsIndexPage() {
  const t = await getT();

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

      {/* Results have no table behind them yet, so there is nothing to list. */}
      <EmptyState
        title={t("results.index.emptyTitle")}
        body={t("results.index.emptyBody")}
        action={{ label: t("results.index.emptyAction"), href: "/events" }}
        className="mt-10"
      />
    </div>
  );
}

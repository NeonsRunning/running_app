import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventModeration } from "@/components/admin/event-moderation";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminEvents } from "@/lib/events/moderation-queries";
import { localizePath } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("adminEvents.metaTitle"), robots: { index: false } };
}

/**
 * Removing events that have runners, which organizers cannot delete, and
 * restoring removed ones. Like the other admin pages, a 404 for anyone but a
 * platform admin. The search and the published/removed switch live in the
 * URL, so a filtered list can be shared and survives a reload.
 */
export default async function AdminEventsPage(
  props: PageProps<"/[lang]/admin/events">,
) {
  if (!(await requireAdmin("/admin/events"))) notFound();

  const params = await props.searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const removed = params.view === "removed";

  const [t, locale, rows] = await Promise.all([
    getT(),
    getLocale(),
    listAdminEvents(query, removed),
  ]);
  const withQuery = (view: "published" | "removed") => {
    const search = new URLSearchParams();
    if (view === "removed") search.set("view", "removed");
    if (query) search.set("q", query);
    const qs = search.toString();
    return qs ? `/admin/events?${qs}` : "/admin/events";
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="pb-8">
        <Eyebrow>{t("adminEvents.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("adminEvents.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("adminEvents.body")}
        </p>
        <div className="mt-6">
          <Button href="/admin/payments" variant="outline" size="sm">
            {t("adminEvents.backToPayments")}
          </Button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <nav aria-label={t("adminEvents.viewLabel")} className="flex gap-2">
          {(["published", "removed"] as const).map((view) => {
            const current = (view === "removed") === removed;
            return (
              <Button
                key={view}
                href={withQuery(view)}
                variant={current ? "secondary" : "ghost"}
                size="sm"
                aria-current={current ? "page" : undefined}
              >
                {t(view === "removed" ? "adminEvents.viewRemoved" : "adminEvents.viewPublished")}
              </Button>
            );
          })}
        </nav>

        <form
          role="search"
          action={localizePath("/admin/events", locale)}
          className="flex w-full gap-2 sm:w-auto"
        >
          {removed ? <input type="hidden" name="view" value="removed" /> : null}
          <label htmlFor="admin-events-q" className="sr-only">
            {t("adminEvents.searchLabel")}
          </label>
          <input
            id="admin-events-q"
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("adminEvents.searchPlaceholder")}
            className="w-full min-w-0 border-2 border-line-strong bg-carbon px-4 py-2.5 text-base text-fg placeholder:text-fg-faint focus:border-neon-lime focus:outline-none sm:w-72"
          />
          <Button type="submit" variant="outline" size="sm">
            {t("adminEvents.search")}
          </Button>
        </form>
      </div>

      {/* Keyed so a new search or view starts from the server's rows. */}
      <EventModeration
        key={`${removed}:${query}`}
        initial={rows}
        removed={removed}
      />
    </div>
  );
}

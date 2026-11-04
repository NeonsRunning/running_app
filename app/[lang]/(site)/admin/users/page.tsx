import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserTable } from "@/components/admin/user-table";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { localizePath } from "@/lib/i18n/config";
import { createFormatters } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { ADMIN_USERS_PAGE_SIZE, listAdminUsers } from "@/lib/profile/admin-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("adminUsers.metaTitle"), robots: { index: false } };
}

/**
 * Every account on the platform, for the team. Like the other admin pages, a
 * 404 for anyone but a platform admin. The search and the page live in the
 * URL, so a filtered list can be shared and survives a reload.
 */
export default async function AdminUsersPage(
  props: PageProps<"/[lang]/admin/users">,
) {
  if (!(await requireAdmin("/admin/users"))) notFound();

  const params = await props.searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  // Capped so a hand-typed page cannot overflow the database's integer offset.
  const page =
    Number.isInteger(requested) && requested > 0 && requested <= 1_000_000
      ? requested
      : 1;

  const [t, locale, { rows, total }] = await Promise.all([
    getT(),
    getLocale(),
    listAdminUsers(query, page),
  ]);
  const fmt = createFormatters(locale);

  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  const first = (page - 1) * ADMIN_USERS_PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const hasNext = last < total;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="pb-8">
        <Eyebrow>{t("adminUsers.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("adminUsers.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("adminUsers.body")}
        </p>
        <div className="mt-6">
          <Button href="/admin/payments" variant="outline" size="sm">
            {t("adminUsers.backToPayments")}
          </Button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono text-[12px] tracking-widest text-fg-dim uppercase">
          {rows.length > 0
            ? t("adminUsers.showing", {
                first: fmt.number(first),
                last: fmt.number(last),
                total: fmt.number(total),
              })
            : null}
        </p>

        <form
          role="search"
          action={localizePath("/admin/users", locale)}
          className="flex w-full gap-2 sm:w-auto"
        >
          <label htmlFor="admin-users-q" className="sr-only">
            {t("adminUsers.searchLabel")}
          </label>
          <input
            id="admin-users-q"
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("adminUsers.searchPlaceholder")}
            className="w-full min-w-0 border-2 border-line-strong bg-carbon px-4 py-2.5 text-base text-fg placeholder:text-fg-faint focus:border-neon-lime focus:outline-none sm:w-80"
          />
          <Button type="submit" variant="outline" size="sm">
            {t("adminUsers.search")}
          </Button>
        </form>
      </div>

      {rows.length > 0 ? (
        <UserTable rows={rows} t={t} fmt={fmt} />
      ) : (
        <div className="border-2 border-line p-7 text-[15px] text-fg-dim">
          <p>{t(page > 1 ? "adminUsers.pastTheEnd" : "adminUsers.empty")}</p>
          {page > 1 ? (
            <div className="mt-4">
              <Button href={pageHref(1)} variant="outline" size="sm">
                {t("adminUsers.firstPage")}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {rows.length > 0 && (page > 1 || hasNext) ? (
        <nav aria-label={t("adminUsers.pagesLabel")} className="mt-6 flex justify-between gap-3">
          {page > 1 ? (
            <Button href={pageHref(page - 1)} variant="outline" size="sm">
              {t("adminUsers.previous")}
            </Button>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Button href={pageHref(page + 1)} variant="outline" size="sm">
              {t("adminUsers.next")}
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

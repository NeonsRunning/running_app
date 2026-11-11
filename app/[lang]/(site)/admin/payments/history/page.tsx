import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaymentHistoryTable } from "@/components/admin/payment-history-table";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { TIME_ZONE } from "@/lib/dates";
import { LOCALE_TAGS, localizePath } from "@/lib/i18n/config";
import { createFormatters } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import {
  ADMIN_PAYMENTS_PAGE_SIZE,
  PAYMENT_METHODS,
  PAYMENT_SORTS,
  listAdminPayments,
  type PaymentMethod,
  type PaymentSort,
} from "@/lib/payments/admin-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("adminPaymentHistory.metaTitle"), robots: { index: false } };
}

const PATH = "/admin/payments/history";

const FIELD =
  "w-full min-w-0 border-2 border-line-strong bg-carbon px-4 py-2.5 text-base text-fg focus:border-neon-lime focus:outline-none";

/**
 * Every payment made on the site — card and ATH Móvil, including the ones
 * since refunded or cancelled. Like the other admin pages, a 404 for anyone
 * but a platform admin. The search, the method, the order and the page live
 * in the URL, so a filtered list can be shared and survives a reload.
 */
export default async function AdminPaymentHistoryPage(
  props: PageProps<"/[lang]/admin/payments/history">,
) {
  if (!(await requireAdmin(PATH))) notFound();

  const params = await props.searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const method = PAYMENT_METHODS.includes(params.method as PaymentMethod)
    ? (params.method as PaymentMethod)
    : null;
  // `order` is "<column>-<asc|desc>"; anything else falls back to newest first.
  const [orderSort, orderDir] =
    typeof params.order === "string" ? params.order.split("-") : [];
  const sort = PAYMENT_SORTS.includes(orderSort as PaymentSort)
    ? (orderSort as PaymentSort)
    : "paid";
  // Newest and largest first by default; names read A to Z.
  const defaultDesc = (s: PaymentSort) => s === "paid" || s === "amount";
  const desc =
    sort === orderSort && (orderDir === "asc" || orderDir === "desc")
      ? orderDir === "desc"
      : defaultDesc(sort);
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  // Capped so a hand-typed page cannot overflow the database's integer offset.
  const page =
    Number.isInteger(requested) && requested > 0 && requested <= 1_000_000
      ? requested
      : 1;

  const [t, locale, { rows, total, totalAmount }] = await Promise.all([
    getT(),
    getLocale(),
    listAdminPayments({ query, method, sort, desc, page }),
  ]);
  const fmt = createFormatters(locale);
  const dateTime = new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });

  const href = (next: {
    sort?: PaymentSort;
    desc?: boolean;
    page?: number;
  }) => {
    const s = next.sort ?? sort;
    const d = next.desc ?? desc;
    const p = next.page ?? 1;
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (method) search.set("method", method);
    if (s !== "paid" || !d) search.set("order", `${s}-${d ? "desc" : "asc"}`);
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `${PATH}?${qs}` : PATH;
  };
  // A new column starts in its natural order; the current one flips.
  const sortHref = (column: PaymentSort) =>
    href({ sort: column, desc: column === sort ? !desc : defaultDesc(column) });

  const first = (page - 1) * ADMIN_PAYMENTS_PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const hasNext = last < total;
  const filtered = Boolean(query || method);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="pb-8">
        <Eyebrow>{t("adminPaymentHistory.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("adminPaymentHistory.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("adminPaymentHistory.body")}
        </p>
        <div className="mt-6">
          <Button href="/admin/payments" variant="outline" size="sm">
            {t("adminPaymentHistory.backToPayments")}
          </Button>
        </div>
      </header>

      <form
        role="search"
        action={localizePath(PATH, locale)}
        className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end"
      >
        <div>
          <label
            htmlFor="admin-payments-q"
            className="mb-1.5 block font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
          >
            {t("adminPaymentHistory.searchLabel")}
          </label>
          <input
            id="admin-payments-q"
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("adminPaymentHistory.searchPlaceholder")}
            className={`${FIELD} placeholder:text-fg-faint`}
          />
        </div>
        <div>
          <label
            htmlFor="admin-payments-method"
            className="mb-1.5 block font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
          >
            {t("adminPaymentHistory.methodLabel")}
          </label>
          <select
            id="admin-payments-method"
            name="method"
            defaultValue={method ?? ""}
            className={FIELD}
          >
            <option value="">{t("adminPaymentHistory.methodAll")}</option>
            <option value="stripe">{t("adminPaymentHistory.methodStripe")}</option>
            <option value="ath_movil">{t("adminPaymentHistory.methodAthMovil")}</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="admin-payments-sort"
            className="mb-1.5 block font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
          >
            {t("adminPaymentHistory.sortLabel")}
          </label>
          {/* One select for column and direction, so a submit keeps both. */}
          <select
            id="admin-payments-sort"
            name="order"
            defaultValue={`${sort}-${desc ? "desc" : "asc"}`}
            className={FIELD}
          >
            {PAYMENT_SORTS.flatMap((s) =>
              (["desc", "asc"] as const).map((d) => (
                <option key={`${s}-${d}`} value={`${s}-${d}`}>
                  {t(`adminPaymentHistory.sortOptions.${s}-${d}`)}
                </option>
              )),
            )}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-[46px]">
          {t("adminPaymentHistory.apply")}
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-[12px] tracking-widest text-fg-dim uppercase">
          {rows.length > 0
            ? t("adminPaymentHistory.showing", {
                first: fmt.number(first),
                last: fmt.number(last),
                total: fmt.number(total),
              })
            : null}
        </p>
        {rows.length > 0 ? (
          <p className="font-mono text-[12px] tracking-widest text-fg-dim uppercase">
            {t("adminPaymentHistory.totalAmount", { amount: fmt.money(totalAmount) })}
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <PaymentHistoryTable
          rows={rows}
          sort={sort}
          desc={desc}
          sortHref={sortHref}
          paidAt={(iso) => dateTime.format(new Date(iso))}
          t={t}
          fmt={fmt}
        />
      ) : (
        <div className="border-2 border-line p-7 text-[15px] text-fg-dim">
          <p>
            {t(
              page > 1
                ? "adminPaymentHistory.pastTheEnd"
                : filtered
                  ? "adminPaymentHistory.noMatches"
                  : "adminPaymentHistory.empty",
            )}
          </p>
          {page > 1 || filtered ? (
            <div className="mt-4">
              <Button
                href={page > 1 ? href({ page: 1 }) : PATH}
                variant="outline"
                size="sm"
              >
                {t(
                  page > 1
                    ? "adminPaymentHistory.firstPage"
                    : "adminPaymentHistory.clearFilters",
                )}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {rows.length > 0 && (page > 1 || hasNext) ? (
        <nav
          aria-label={t("adminPaymentHistory.pagesLabel")}
          className="mt-6 flex justify-between gap-3"
        >
          {page > 1 ? (
            <Button href={href({ page: page - 1 })} variant="outline" size="sm">
              {t("adminPaymentHistory.previous")}
            </Button>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Button href={href({ page: page + 1 })} variant="outline" size="sm">
              {t("adminPaymentHistory.next")}
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

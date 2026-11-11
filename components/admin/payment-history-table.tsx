import { Link } from "@/components/i18n/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { Formatters } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/translate";
import type {
  AdminPaymentRow,
  PaymentSort,
  PaymentState,
} from "@/lib/payments/admin-queries";

const STATE_TONE: Record<PaymentState, BadgeTone> = {
  paid: "green",
  partiallyRefunded: "yellow",
  refunded: "outline",
  cancelled: "neutral",
  disputed: "danger",
};

/**
 * The payments on `/admin/payments/history`, one per row. A server
 * component: sorting is a link per column, so the order lives in the URL like
 * the search does. The table scrolls sideways inside its own box on a narrow
 * screen.
 */
export function PaymentHistoryTable({
  rows,
  sort,
  desc,
  sortHref,
  paidAt,
  t,
  fmt,
}: {
  rows: AdminPaymentRow[];
  sort: PaymentSort;
  desc: boolean;
  /** The URL that sorts by this column; the current one flips its direction. */
  sortHref: (column: PaymentSort) => string;
  /** Formats when the payment landed, in Puerto Rico time. */
  paidAt: (iso: string) => string;
  t: Translate;
  fmt: Formatters;
}) {
  const columns: { label: string; sort?: PaymentSort; align?: "right" }[] = [
    { label: t("adminPaymentHistory.columnPaid"), sort: "paid" },
    { label: t("adminPaymentHistory.columnRunner"), sort: "runner" },
    { label: t("adminPaymentHistory.columnEvent"), sort: "event" },
    { label: t("adminPaymentHistory.columnMethod") },
    { label: t("adminPaymentHistory.columnReference") },
    { label: t("adminPaymentHistory.columnAmount"), sort: "amount", align: "right" },
    { label: t("adminPaymentHistory.columnStatus") },
  ];

  return (
    <div className="overflow-x-auto border-2 border-line">
      <table className="w-full min-w-[68rem] border-collapse">
        <caption className="sr-only">{t("adminPaymentHistory.title")}</caption>
        <thead>
          <tr className="border-b-2 border-line">
            {columns.map((col) => {
              const active = col.sort === sort;
              return (
                <th
                  key={col.label}
                  scope="col"
                  aria-sort={
                    active ? (desc ? "descending" : "ascending") : undefined
                  }
                  className={`px-3 py-3 font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.sort ? (
                    <Link
                      href={sortHref(col.sort)}
                      className={`inline-flex items-center gap-1 hover:text-neon-lime ${
                        active ? "text-fg" : ""
                      }`}
                    >
                      {col.label}
                      <span aria-hidden="true" className="w-2">
                        {active ? (desc ? "↓" : "↑") : ""}
                      </span>
                    </Link>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b-2 border-line align-top last:border-b-0">
              <td className="px-3 py-3 text-sm whitespace-nowrap text-fg-dim tabular-nums">
                {paidAt(row.paidAt)}
              </td>
              <td className="px-3 py-3">
                <Link
                  href={`/runners/${row.runnerId}`}
                  className="text-sm font-bold wrap-break-word hover:text-neon-lime"
                >
                  {row.runnerName}
                </Link>
                <p translate="no" className="text-[11px] break-all text-fg-faint">
                  {row.email}
                </p>
              </td>
              <td className="px-3 py-3 text-sm">
                <Link
                  href={`/events/${row.eventSlug}`}
                  className="wrap-break-word hover:text-neon-lime"
                >
                  {row.eventName}
                </Link>
                {row.bib !== null ? (
                  <p className="text-[11px] text-fg-faint tabular-nums">
                    {t("adminPaymentHistory.bib", { bib: row.bib })}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-3 text-sm whitespace-nowrap text-fg-dim">
                {row.method === "ath_movil"
                  ? t("adminPaymentHistory.methodAthMovil")
                  : row.method === "stripe"
                    ? t("adminPaymentHistory.methodStripe")
                    : "—"}
              </td>
              <td
                translate="no"
                className="px-3 py-3 font-mono text-[12px] break-all text-fg-dim"
              >
                {row.reference ?? "—"}
              </td>
              <td className="px-3 py-3 text-right text-sm whitespace-nowrap tabular-nums">
                <span className="font-bold">{fmt.money(row.amount)}</span>
                {row.amountRefunded > 0 ? (
                  <p className="text-[11px] text-fg-faint">
                    {t("adminPaymentHistory.refundedAmount", {
                      amount: fmt.money(row.amountRefunded),
                    })}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <Badge tone={STATE_TONE[row.state]}>
                  {t(`adminPaymentHistory.state.${row.state}`)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

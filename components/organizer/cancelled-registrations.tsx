import { puertoRicoDate } from "@/lib/dates";
import type { CancelledRegistrationRow } from "@/lib/events/organizer";
import type { Formatters } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Runners the organizer or an admin took off the event. Their registrations
 * are kept as the record of what was paid (see the registration lifecycle
 * migration), and this is where whoever issues the refund finds it: the
 * amount, how it was paid — with the ATH Móvil reference — and whether a
 * card refund has gone through. Stripe refunds and disputes are recorded by
 * the webhook; ATH Móvil refunds are made in the business app and not
 * recorded, so those rows always read "not recorded".
 *
 * A server component, collapsed by default and shown only when there is
 * someone to show: a native <details>, so it opens from the keyboard with no
 * script.
 */
export function CancelledRegistrations({
  rows,
  categories,
  t,
  fmt,
}: {
  rows: CancelledRegistrationRow[];
  /** Category id to distance, as on the completed list. */
  categories: Record<string, string>;
  t: Translate;
  fmt: Formatters;
}) {
  if (rows.length === 0) return null;
  const k = (key: string) => `cancelledRegistrations.${key}`;

  function method(row: CancelledRegistrationRow) {
    if (row.paymentMethod === "ath_movil") return t("eventRegistrations.athMovil");
    if (row.paymentMethod === "stripe") return t("eventRegistrations.card");
    return "—";
  }

  function refund(row: CancelledRegistrationRow) {
    if (row.amountRefunded >= row.amount) return t(k("refundedFull"));
    if (row.amountRefunded > 0)
      return t(k("refundedPartly"), { amount: fmt.money(row.amountRefunded) });
    return row.paymentMethod === "stripe" ? t(k("notRefunded")) : t(k("notRecorded"));
  }

  return (
    <details className="group mt-8 border-2 border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-lime">
        <span>
          <span className="font-display text-lg font-black uppercase">
            {t(k("title"))}
          </span>
          <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase">
            {t(k("count"), { count: fmt.number(rows.length) })}
          </span>
        </span>
        <span aria-hidden="true" className="font-mono text-fg-dim group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="border-t-2 border-line px-4 py-4">
        <p className="max-w-3xl text-[14px] leading-relaxed text-fg-dim">{t(k("body"))}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr className="border-b-2 border-line">
                {["bib", "runner", "distance", "paid", "removed", "refund"].map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-3 py-3 text-left font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
                  >
                    {t(k(`columns.${col}`))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b-2 border-line align-top last:border-b-0">
                  <td className="px-3 py-3 font-mono text-sm tabular-nums text-fg-dim">
                    {row.bib ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-sm font-bold break-words">{row.runnerName}</p>
                    <p translate="no" className="text-[11px] break-all text-fg-faint">
                      {row.email}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {categories[row.categoryId]
                      ? distanceLabel(t, categories[row.categoryId])
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <p className="font-mono tabular-nums">{fmt.money(row.amount)}</p>
                    <p className="text-[11px] text-fg-faint">
                      {method(row)}
                      {row.paymentReference ? (
                        <>
                          {" · "}
                          <span translate="no" className="font-mono">
                            {row.paymentReference}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    {row.cancelledAt ? fmt.mediumDate(puertoRicoDate(row.cancelledAt)) : "—"}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <p>{refund(row)}</p>
                    {row.disputeStatus ? (
                      <p className="text-[11px] font-semibold text-danger">
                        {t(k("disputed"), { status: row.disputeStatus.replace(/_/g, " ") })}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

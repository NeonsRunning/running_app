import type { Formatters } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/translate";
import type { AdminPaymentKpis } from "@/lib/payments/admin-queries";

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function Tile({
  label,
  value,
  detail,
  hero = false,
  alert = false,
}: {
  label: string;
  value: string;
  detail?: string;
  hero?: boolean;
  /** Something needs a person: an open dispute has a response deadline. */
  alert?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 border-2 p-4 ${
        alert ? "border-danger" : hero ? "border-neon-lime" : "border-line"
      }`}
    >
      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
        {label}
      </dt>
      <dd
        className={`font-display font-black tabular-nums ${
          hero ? "text-3xl sm:text-4xl" : "text-2xl"
        }`}
      >
        {value}
      </dd>
      {detail ? <dd className="text-[12px] text-fg-dim tabular-nums">{detail}</dd> : null}
    </div>
  );
}

/**
 * The money in the payments the filters match, above the list on
 * `/admin/payments/history`. Plain figures, no chart: each answers one
 * question on its own. Stripe's processing fees are not stored here, so
 * "net" is before them.
 */
export function PaymentKpis({
  kpis,
  t,
  fmt,
}: {
  kpis: AdminPaymentKpis;
  t: Translate;
  fmt: Formatters;
}) {
  const k = (key: string) => `adminPaymentHistory.kpis.${key}`;
  const average = kpis.payments > 0 ? kpis.gross / kpis.payments : 0;

  return (
    <section aria-labelledby="payment-kpis-heading" className="mb-8">
      <h2 id="payment-kpis-heading" className="sr-only">
        {t(k("heading"))}
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          hero
          label={t(k("net"))}
          value={fmt.money(kpis.net)}
          detail={t(k("netDetail"))}
        />
        <Tile
          label={t(k("gross"))}
          value={fmt.money(kpis.gross)}
          detail={t(k("grossDetail"), {
            count: fmt.number(kpis.payments),
            average: fmt.money(average),
          })}
        />
        <Tile
          label={t(k("refunded"))}
          value={fmt.money(kpis.refunded)}
          detail={t(k("refundedDetail"), {
            count: fmt.number(kpis.refunds),
            share: fmt.number(share(kpis.refunded, kpis.gross)),
          })}
        />
        <Tile
          alert={kpis.disputesOpenCount > 0}
          label={t(k("disputes"))}
          value={fmt.money(kpis.disputesOpen)}
          detail={t(k("disputesDetail"), {
            count: fmt.number(kpis.disputesOpenCount),
            lost: fmt.money(kpis.disputesLost),
          })}
        />
        <Tile
          label={t(k("serviceFees"))}
          value={fmt.money(kpis.serviceFees)}
          detail={t(k("serviceFeesDetail"))}
        />
        <Tile
          label={t(k("salesTax"))}
          value={fmt.money(kpis.salesTax)}
          detail={t(k("salesTaxDetail"))}
        />
        <Tile
          label={t(k("donations"))}
          value={fmt.money(kpis.donations)}
          detail={t(k("donationsDetail"))}
        />
        <Tile
          label={t(k("byMethod"))}
          value={`${fmt.number(share(kpis.cardGross, kpis.gross))}% · ${fmt.number(
            share(kpis.athGross, kpis.gross),
          )}%`}
          detail={t(k("byMethodDetail"), {
            card: fmt.money(kpis.cardGross),
            cardCount: fmt.number(kpis.cardCount),
            ath: fmt.money(kpis.athGross),
            athCount: fmt.number(kpis.athCount),
          })}
        />
      </dl>
    </section>
  );
}

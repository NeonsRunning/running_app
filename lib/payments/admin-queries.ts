import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** How many payments one page of `/admin/payments/history` shows. */
export const ADMIN_PAYMENTS_PAGE_SIZE = 50;

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["stripe", "ath_movil"];

export type PaymentSort = "paid" | "amount" | "runner" | "event";
export const PAYMENT_SORTS: readonly PaymentSort[] = ["paid", "amount", "runner", "event"];

/** Where the money stands now, most serious first. */
export type PaymentState =
  | "disputed"
  | "refunded"
  | "partiallyRefunded"
  | "cancelled"
  | "paid";

export type AdminPaymentRow = {
  id: string;
  eventName: string;
  eventSlug: string;
  runnerId: string;
  runnerName: string;
  email: string;
  bib: number | null;
  method: PaymentMethod | null;
  amount: number;
  amountRefunded: number;
  disputeStatus: string | null;
  state: PaymentState;
  /** The ATH Móvil receipt reference, or the Stripe PaymentIntent id. */
  reference: string | null;
  paidAt: string;
};

export type AdminPaymentsFilter = {
  query: string;
  method: PaymentMethod | null;
  /** Island dates, YYYY-MM-DD, both ends included; null leaves that end open. */
  from: string | null;
  to: string | null;
  sort: PaymentSort;
  desc: boolean;
  page: number;
};

type Row = Database["public"]["Functions"]["admin_list_payments"]["Returns"][number];

export function paymentState(r: {
  status: Row["status"];
  amount: number;
  amount_refunded: number;
  dispute_status: string | null;
}): PaymentState {
  if (r.dispute_status && r.dispute_status !== "won") return "disputed";
  const refunded = Number(r.amount_refunded);
  if (refunded > 0) return refunded >= Number(r.amount) ? "refunded" : "partiallyRefunded";
  if (r.status === "cancelled") return "cancelled";
  return "paid";
}

/**
 * One page of payments and the count and sum of every match.
 *
 * Throws on a failed read, so the page shows its error screen rather than
 * reporting that nobody has paid. That includes a caller who is not a
 * platform admin: `admin_list_payments()` checks the role.
 */
export async function listAdminPayments(
  filter: AdminPaymentsFilter,
): Promise<{ rows: AdminPaymentRow[]; total: number; totalAmount: number }> {
  if (!hasSupabaseEnv()) return { rows: [], total: 0, totalAmount: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_payments", {
    p_query: filter.query.trim() || undefined,
    p_method: filter.method ?? undefined,
    p_from: filter.from ?? undefined,
    p_to: filter.to ?? undefined,
    p_sort: filter.sort,
    p_desc: filter.desc,
    p_limit: ADMIN_PAYMENTS_PAGE_SIZE,
    p_offset: (filter.page - 1) * ADMIN_PAYMENTS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_payments failed: ${error.message}`);

  return {
    rows: data.map((r) => ({
      id: r.id,
      eventName: r.event_name,
      eventSlug: r.event_slug,
      runnerId: r.runner_id,
      runnerName: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email,
      bib: r.bib,
      method: r.payment_method,
      amount: Number(r.amount),
      amountRefunded: Number(r.amount_refunded),
      disputeStatus: r.dispute_status,
      state: paymentState(r),
      reference:
        r.payment_method === "ath_movil" ? r.payment_reference : r.payment_intent_id,
      paidAt: r.paid_at,
    })),
    total: Number(data[0]?.total_count ?? 0),
    totalAmount: Number(data[0]?.total_amount ?? 0),
  };
}

/** The money in every payment that matches; see `admin_payment_kpis()`. */
export type AdminPaymentKpis = {
  payments: number;
  gross: number;
  refunded: number;
  refunds: number;
  disputesLost: number;
  disputesOpen: number;
  disputesOpenCount: number;
  net: number;
  serviceFees: number;
  salesTax: number;
  donations: number;
  cardGross: number;
  cardCount: number;
  athGross: number;
  athCount: number;
};

const NO_KPIS: AdminPaymentKpis = {
  payments: 0, gross: 0, refunded: 0, refunds: 0, disputesLost: 0,
  disputesOpen: 0, disputesOpenCount: 0, net: 0, serviceFees: 0,
  salesTax: 0, donations: 0, cardGross: 0, cardCount: 0, athGross: 0,
  athCount: 0,
};

/**
 * The figures above the list, over the same search, method and dates.
 * Throws on a failed read, like `listAdminPayments()`: zeros would look
 * like a month with no money.
 */
export async function getAdminPaymentKpis(
  filter: Pick<AdminPaymentsFilter, "query" | "method" | "from" | "to">,
): Promise<AdminPaymentKpis> {
  if (!hasSupabaseEnv()) return NO_KPIS;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_payment_kpis", {
    p_query: filter.query.trim() || undefined,
    p_method: filter.method ?? undefined,
    p_from: filter.from ?? undefined,
    p_to: filter.to ?? undefined,
  });
  if (error) throw new Error(`admin_payment_kpis failed: ${error.message}`);
  const r = data[0];
  if (!r) return NO_KPIS;

  return {
    payments: Number(r.payments),
    gross: Number(r.gross),
    refunded: Number(r.refunded),
    refunds: Number(r.refunds),
    disputesLost: Number(r.disputes_lost),
    disputesOpen: Number(r.disputes_open),
    disputesOpenCount: Number(r.disputes_open_count),
    net: Number(r.net),
    serviceFees: Number(r.service_fees),
    salesTax: Number(r.sales_tax),
    donations: Number(r.donations),
    cardGross: Number(r.card_gross),
    cardCount: Number(r.card_count),
    athGross: Number(r.ath_gross),
    athCount: Number(r.ath_count),
  };
}

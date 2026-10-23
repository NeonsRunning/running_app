import "server-only";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { paymentCode, toAthMovilAccount, type AthMovilAccount } from "./config";

export type AthMovilSubmissionRow = {
  id: string;
  code: string;
  eventName: string;
  eventDate: string;
  runnerName: string;
  email: string;
  phone: string;
  amount: number;
  reference: string;
  submittedAt: string;
  /** The business account it was sent to; null for older submissions. */
  account: { label: string; path: string } | null;
};

/**
 * ATH Móvil submissions waiting for review, oldest first. Empty for anyone
 * but a platform admin: `ath_movil_review_queue()` checks the role.
 */
export async function listAthMovilSubmissions(): Promise<AthMovilSubmissionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ath_movil_review_queue");
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    code: paymentCode(r.id),
    eventName: r.event_name,
    eventDate: r.event_date,
    runnerName: `${r.first_name} ${r.last_name}`,
    email: r.email,
    phone: r.phone,
    amount: Number(r.amount),
    reference: r.payment_reference,
    submittedAt: r.payment_submitted_at,
    account:
      r.account_label && r.account_path
        ? { label: r.account_label, path: r.account_path }
        : null,
  }));
}

export type EventPaymentRow = {
  id: string;
  code: string;
  runnerName: string;
  email: string;
  phone: string;
  categoryId: string;
  amount: number;
  reference: string;
  submittedAt: string;
  /** Business path it was sent to; empty for older submissions. */
  accountPath: string;
};

/**
 * One event's ATH Móvil submissions waiting for review, oldest first. Read
 * through RLS, so it is empty for anyone but the event's organizer.
 */
export async function listEventAthMovilSubmissions(
  eventId: string,
): Promise<EventPaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, first_name, last_name, email, phone, category_id, amount, payment_reference, payment_submitted_at, account:ath_movil_accounts!registrations_ath_movil_account_id_fkey (path)",
    )
    .eq("event_id", eventId)
    .eq("status", "pending")
    .not("payment_submitted_at", "is", null)
    .order("payment_submitted_at");
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    code: paymentCode(r.id),
    runnerName: `${r.first_name} ${r.last_name}`,
    email: r.email,
    phone: r.phone,
    categoryId: r.category_id,
    amount: Number(r.amount),
    // Both set together by `submit_ath_movil_payment()`.
    reference: r.payment_reference ?? "",
    submittedAt: r.payment_submitted_at ?? "",
    accountPath: r.account?.path ?? "",
  }));
}

export type AthMovilAccountRow = AthMovilAccount & {
  qrPath: string | null;
  active: boolean;
};

/**
 * The ATH Móvil Business accounts admins have listed, by label. Retired ones
 * are left out unless asked for: only the admin page shows them.
 */
export async function listAthMovilAccounts({
  includeRetired = false,
}: { includeRetired?: boolean } = {}): Promise<AthMovilAccountRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("ath_movil_accounts")
    .select("id, label, path, qr_path, active");
  if (!includeRetired) query = query.eq("active", true);
  const { data, error } = await query.order("label");
  if (error || !data) return [];

  return data.map((r) => ({
    ...toAthMovilAccount(r),
    qrPath: r.qr_path,
    active: r.active,
  }));
}

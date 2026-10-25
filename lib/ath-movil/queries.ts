import "server-only";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /**
   * Whether the viewer may approve or reject it: a platform admin, or the
   * organizer when the money went into an account they own. Mirrors
   * `can_review_ath_movil_payment()`, which decides.
   */
  canReview: boolean;
};

/**
 * One event's ATH Móvil submissions waiting for review, oldest first. Read
 * through RLS, so it is empty for anyone but the event's organizer and
 * platform admins.
 */
export async function listEventAthMovilSubmissions(
  eventId: string,
): Promise<EventPaymentRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: auth }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, phone, category_id, amount, payment_reference, payment_submitted_at, account:ath_movil_accounts!registrations_ath_movil_account_id_fkey (path, owner_id)",
      )
      .eq("event_id", eventId)
      .eq("status", "pending")
      .not("payment_submitted_at", "is", null)
      .order("payment_submitted_at"),
    supabase.auth.getUser(),
    supabase.rpc("is_platform_admin"),
  ]);
  if (error || !data) return [];
  const viewer = auth.user?.id;

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
    canReview:
      isAdmin === true ||
      (Boolean(viewer) && r.account?.owner_id === viewer),
  }));
}

/** The organizer who holds an account's business app, as the admin sees them. */
export type AthMovilOwner = { id: string; handle: string; name: string };

export type AthMovilAccountRow = AthMovilAccount & {
  qrPath: string | null;
  active: boolean;
  /**
   * The organizer who holds the business app and may approve payments into
   * it; null when only platform admins review. Stored by account id — a
   * handle is the runner's to change — and filled in only for the admin page
   * (`withOwners`).
   */
  owner: AthMovilOwner | null;
};

/**
 * These accounts' owners, by id. Read with the service role: an owner's
 * profile may be private, and only admins ever see this — callers must have
 * checked that first.
 */
export async function getOwners(
  ownerIds: (string | null)[],
): Promise<Map<string, AthMovilOwner>> {
  const ids = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, handle, full_name")
    .in("id", ids);
  return new Map(
    (data ?? []).map((p) => [p.id, { id: p.id, handle: p.handle, name: p.full_name }]),
  );
}

/**
 * The ATH Móvil Business accounts admins have listed, by label. Retired ones
 * are left out unless asked for, and owners are only looked up when asked
 * for: both are for the admin page alone, which has checked the role.
 */
export async function listAthMovilAccounts({
  includeRetired = false,
  withOwners = false,
}: { includeRetired?: boolean; withOwners?: boolean } = {}): Promise<AthMovilAccountRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("ath_movil_accounts")
    .select("id, label, path, qr_path, active, owner_id");
  if (!includeRetired) query = query.eq("active", true);
  const { data, error } = await query.order("label");
  if (error || !data) return [];

  const owners = withOwners
    ? await getOwners(data.map((r) => r.owner_id))
    : new Map<string, AthMovilOwner>();

  return data.map((r) => ({
    ...toAthMovilAccount(r),
    qrPath: r.qr_path,
    active: r.active,
    owner: r.owner_id ? (owners.get(r.owner_id) ?? null) : null,
  }));
}

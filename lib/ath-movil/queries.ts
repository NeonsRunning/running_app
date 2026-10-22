import "server-only";
import { createClient } from "@/lib/supabase/server";
import { paymentCode } from "./config";

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
      "id, first_name, last_name, email, phone, category_id, amount, payment_reference, payment_submitted_at",
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
  }));
}

"use server";

import { revalidatePath } from "next/cache";
import { scheduleAthMovilRejectedEmail } from "@/lib/email/ath-movil-rejected";
import { scheduleRegistrationEmail } from "@/lib/email/registration-confirmed";
import { createClient } from "@/lib/supabase/server";

/**
 * Reviewing ATH Móvil payments: the reviewer's half of `lib/ath-movil/config.ts`.
 *
 * The event's organizer — or a platform admin — looks each payment up in the
 * ATH Móvil Business app, by the reference on the runner's receipt, the code
 * in its message, or the amount and name, and approves or rejects the sign-up
 * here. Whether the caller may is decided by `review_ath_movil_payment()`.
 */

export type ReviewResult =
  | { ok: true }
  /** A key under `adminPayments.errors` and `eventPayments.errors`. */
  | { ok: false; error: "notAllowed" | "alreadyReviewed" | "reviewFailed" };

/**
 * Approve: the runner gets their bib and the confirmation email. Reject: the
 * spot is released, the runner is emailed, and can pay again from the
 * register page.
 */
export async function reviewAthMovilPaymentAction(
  registrationId: string,
  approve: boolean,
): Promise<ReviewResult> {
  if (typeof registrationId !== "string" || typeof approve !== "boolean") {
    return { ok: false, error: "reviewFailed" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_ath_movil_payment", {
    p_registration_id: registrationId,
    p_approve: approve,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (key === "notAllowed") return { ok: false, error: "notAllowed" };
    // Someone else reviewed it first, or the id is not in the queue.
    if (key === "registrationMissing") return { ok: false, error: "alreadyReviewed" };
    console.error(`Reviewing ${registrationId} failed:`, error?.message);
    return { ok: false, error: "reviewFailed" };
  }

  if (approve) await scheduleRegistrationEmail(data);
  else await scheduleAthMovilRejectedEmail(data);
  // Spots left and the runner's own pages change either way.
  revalidatePath("/", "layout");
  return { ok: true };
}

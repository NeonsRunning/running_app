import "server-only";
import type Stripe from "stripe";
import { scheduleRegistrationEmail } from "@/lib/email/registration-confirmed";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { getStripe, hasStripeEnv } from "@/lib/stripe/server";

/**
 * Turning a Stripe payment into a confirmed registration.
 *
 * Three callers report the same payment, in no fixed order: the payment step
 * once Stripe.js says it went through, the register page when a runner comes
 * back from a redirect, and the webhook. `confirm_registration_payment()` is
 * idempotent, so whichever arrives first assigns the bib and the rest read it
 * back.
 *
 * A payment that cannot become a registration — the race filled up while the
 * hold had lapsed, the order was repriced in another tab, a second payment for
 * a sign-up that is already confirmed — is refunded in full here. Money never
 * stays with us without a bib to show for it.
 *
 * Callers that can — server actions, the webhook — revalidate the layout
 * afterwards: spots left changes with every sign-up. A page render cannot.
 *
 * A confirmation also schedules the runner's confirmation email; see
 * `lib/email/registration-confirmed.ts` for how it goes out only once.
 */

type Registration = Tables<"registrations">;

export type SettleResult =
  | { ok: true; registration: Registration }
  | {
      ok: false;
      /** A key under `register.errors`. */
      error: "paymentRefunded" | "soldOut" | "registrationFailed";
    };

/**
 * Errors `confirm_registration_payment()` raises for a payment to refund.
 * `paymentUnderReview`: the runner already sent the money by ATH Móvil.
 */
const REFUNDABLE = new Set([
  "registrationMissing",
  "amountMismatch",
  "soldOut",
  "paymentUnderReview",
]);

async function refund(paymentIntentId: string) {
  try {
    await getStripe().refunds.create(
      { payment_intent: paymentIntentId },
      // The page and the webhook can both get here for one payment.
      { idempotencyKey: `refund-${paymentIntentId}` },
    );
  } catch (err) {
    // Most likely already refunded. Anything else needs a person to look.
    console.error(`Refund of ${paymentIntentId} failed:`, err);
  }
}

export async function settlePayment(
  intent: Stripe.PaymentIntent,
): Promise<SettleResult> {
  const registrationId = intent.metadata?.registration_id;
  // Not one of ours — another integration on the same Stripe account.
  if (!registrationId || intent.status !== "succeeded") {
    return { ok: false, error: "registrationFailed" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_registration_payment", {
    p_registration_id: registrationId,
    p_payment_intent_id: intent.id,
    p_amount_cents: intent.amount_received,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (REFUNDABLE.has(key)) {
      await refund(intent.id);
      return { ok: false, error: key === "soldOut" ? "soldOut" : "paymentRefunded" };
    }
    // A database hiccup: leave the payment alone so a retry can confirm it.
    console.error(`Confirming ${intent.id} failed:`, error?.message);
    return { ok: false, error: "registrationFailed" };
  }

  // Confirmed earlier by a different payment: this one is a duplicate.
  if (data.payment_intent_id !== intent.id) await refund(intent.id);
  else await scheduleRegistrationEmail(data);

  return { ok: true, registration: data };
}

/**
 * Confirm the runner's pending sign-up for this race if its payment has
 * cleared — they paid and were redirected back, or closed the tab before the
 * payment step heard back. Quiet on every failure: the page then shows the
 * flow as usual, and the webhook still gets its turn.
 */
export async function reconcilePendingPayment(
  runnerId: string,
  eventId: string,
): Promise<void> {
  if (!hasStripeEnv()) return;

  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("registrations")
    .select("payment_intent_id")
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .eq("status", "pending")
    .maybeSingle();
  if (!pending?.payment_intent_id) return;

  try {
    const intent = await getStripe().paymentIntents.retrieve(
      pending.payment_intent_id,
    );
    if (intent.status === "succeeded") await settlePayment(intent);
  } catch (err) {
    console.error("Reconciling a pending payment failed:", err);
  }
}

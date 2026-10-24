import "server-only";
import type Stripe from "stripe";
import {
  schedulePaymentRefundedEmail,
  type RefundReason,
} from "@/lib/email/payment-refunded";
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
 * stays with us without a bib to show for it, and the runner is told why by
 * email.
 *
 * Callers that can — server actions, the webhook — revalidate the layout
 * afterwards: spots left changes with every sign-up. A page render cannot.
 *
 * A confirmation also schedules the runner's confirmation email; see
 * `lib/email/registration-confirmed.ts` for how it goes out only once.
 */

type Registration = Tables<"registrations">;

export type SettleResult =
  | {
      ok: true;
      registration: Registration;
      /** This payment duplicated the one that confirmed it, and its refund failed. */
      refundFailed?: boolean;
    }
  | {
      ok: false;
      /** A key under `register.errors`. */
      error:
        | "paymentRefunded"
        | "soldOut"
        | "registrationFailed"
        /** This payment's registration was cancelled since it confirmed it. */
        | "registrationCancelled";
    };

/**
 * Errors `confirm_registration_payment()` raises for a payment to refund.
 * `paymentUnderReview`: the runner already sent the money by ATH Móvil.
 */
const REFUNDABLE = new Set<string>([
  "registrationMissing",
  "amountMismatch",
  "soldOut",
  "paymentUnderReview",
]);

/**
 * Refund in full and tell the runner. The page and the webhook can both get
 * here for one payment: the idempotency key makes the second call a replay of
 * the first, and only the call that created the refund sends the email.
 *
 * Resolves false when the money is still with us. The caller must not report
 * the payment as settled then: the webhook answers with an error so Stripe
 * delivers it again, and the retry refunds.
 */
async function refund(
  intent: Stripe.PaymentIntent,
  reason: RefundReason,
): Promise<boolean> {
  try {
    const created = await getStripe().refunds.create(
      { payment_intent: intent.id },
      { idempotencyKey: `refund-${intent.id}` },
    );
    const replayed = Object.entries(created.lastResponse.headers).some(
      ([name, value]) =>
        name.toLowerCase() === "idempotent-replayed" && value === "true",
    );
    if (!replayed) await schedulePaymentRefundedEmail(intent, reason);
    return true;
  } catch (err) {
    // Refunded already — by an earlier call whose idempotency key has since
    // expired, or by hand in the dashboard. The runner has their money.
    if ((err as { code?: string }).code === "charge_already_refunded") return true;
    console.error(
      `REFUND FAILED: ${intent.id} (${intent.amount_received} cents, ` +
        `registration ${intent.metadata?.registration_id}, ${reason}) is still charged:`,
      err,
    );
    return false;
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
      // Not refunded yet: say so, rather than promise money back that is
      // still with us. The webhook retries on this error.
      if (!(await refund(intent, key as RefundReason))) {
        return { ok: false, error: "registrationFailed" };
      }
      return { ok: false, error: key === "soldOut" ? "soldOut" : "paymentRefunded" };
    }
    // A database hiccup: leave the payment alone so a retry can confirm it.
    console.error(`Confirming ${intent.id} failed:`, error?.message);
    return { ok: false, error: "registrationFailed" };
  }

  // The organizer or an admin took the runner off the race after this payment
  // confirmed it: a late or replayed report of that same payment. Nothing to
  // do — whether it is refunded is a person's call, made in Stripe.
  if (data.status === "cancelled" && data.payment_intent_id === intent.id) {
    return { ok: false, error: "registrationCancelled" };
  }

  // Confirmed earlier by a different payment: this one is a duplicate. The
  // sign-up itself is fine, so the runner still sees it; only the webhook
  // needs to hear that the refund has to be tried again.
  if (data.payment_intent_id !== intent.id) {
    const refunded = await refund(intent, "duplicate");
    return { ok: true, registration: data, refundFailed: !refunded };
  }

  await scheduleRegistrationEmail(data);
  return { ok: true, registration: data };
}

/** A PaymentIntent reference as Stripe embeds it: an id, the object, or nothing. */
function intentId(ref: string | Stripe.PaymentIntent | null): string | null {
  return typeof ref === "string" ? ref : (ref?.id ?? null);
}

/**
 * Record a refund made on a registration's payment — from the Stripe
 * dashboard, usually, after a runner was taken off a race. `amount_refunded`
 * on the charge is the running total, so the update only ever raises the
 * stored one: a delivery that arrives late cannot lower it. Payments that
 * belong to no registration (the duplicates and late payments refunded in
 * `settlePayment`) match nothing and are left alone.
 *
 * Resolves false on a database failure, so the webhook asks Stripe to retry.
 */
export async function recordRefund(charge: Stripe.Charge): Promise<boolean> {
  const paymentIntent = intentId(charge.payment_intent);
  if (!paymentIntent || charge.amount_refunded <= 0) return true;

  const { error } = await createAdminClient()
    .from("registrations")
    .update({
      amount_refunded: charge.amount_refunded / 100,
      refunded_at: new Date().toISOString(),
    })
    .eq("payment_intent_id", paymentIntent)
    .lte("amount_refunded", charge.amount_refunded / 100);
  if (error) {
    console.error(`Recording the refund on ${paymentIntent} failed:`, error.message);
    return false;
  }
  return true;
}

/**
 * Record a dispute (chargeback) on a registration's payment, and its status
 * as Stripe moves it along. Logged loudly as well: a dispute has a response
 * deadline, and someone has to answer it in the Stripe dashboard.
 *
 * Resolves false on a database failure, so the webhook asks Stripe to retry.
 */
export async function recordDispute(dispute: Stripe.Dispute): Promise<boolean> {
  const paymentIntent = intentId(dispute.payment_intent);
  if (!paymentIntent) return true;

  console.error(
    `PAYMENT DISPUTED: ${paymentIntent} (${dispute.amount} cents) is ${dispute.status}; ` +
      "answer it in the Stripe dashboard.",
  );

  const { error } = await createAdminClient()
    .from("registrations")
    .update({
      disputed_at: new Date(dispute.created * 1000).toISOString(),
      dispute_status: dispute.status,
    })
    .eq("payment_intent_id", paymentIntent);
  if (error) {
    console.error(`Recording the dispute on ${paymentIntent} failed:`, error.message);
    return false;
  }
  return true;
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

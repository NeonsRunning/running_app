import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { DEFAULT_LOCALE, localizePath } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getLocaleOf } from "./recipient";
import { siteOrigin } from "@/lib/site-url";

/**
 * "We refunded your payment" — the email a runner gets when `settlePayment()`
 * refunds a card payment that could not become a registration, with why.
 *
 * Several callers can refund the same payment; only the one whose refund
 * Stripe actually created (not an idempotent replay) schedules this, so it
 * goes out once. The registration may be gone by now, so everything is read
 * from the payment itself: its receipt address and its metadata.
 */

/** Why the payment was refunded. A key under `emails.paymentRefunded.reasons`. */
export type RefundReason =
  | "soldOut"
  | "registrationMissing"
  | "amountMismatch"
  | "paymentUnderReview"
  | "duplicate";

export async function schedulePaymentRefundedEmail(
  intent: Stripe.PaymentIntent,
  reason: RefundReason,
): Promise<void> {
  const to = intent.receipt_email;
  if (!hasBrevoEnv() || !to) return;

  const origin = await siteOrigin();
  after(() =>
    sendPaymentRefundedEmail(intent, to, reason, origin).catch((err) => {
      console.error(`Refund email for ${intent.id} failed:`, err);
    }),
  );
}

async function sendPaymentRefundedEmail(
  intent: Stripe.PaymentIntent,
  to: string,
  reason: RefundReason,
  origin: string,
) {
  const { event_id: eventId, runner_id: runnerId } = intent.metadata ?? {};
  const [{ data: event }, locale] = await Promise.all([
    eventId
      ? createAdminClient()
          .from("events")
          .select("name, slug, status")
          .eq("id", eventId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    runnerId ? getLocaleOf(runnerId) : DEFAULT_LOCALE,
  ]);
  const eventName = event?.name ?? "";

  const t = await getTranslator(locale);
  const k = (key: string) => `emails.paymentRefunded.${key}`;
  const rows: [string, string][] = [
    ...(eventName ? [[t(k("race")), eventName] as [string, string]] : []),
    [t(k("amount")), formatMoney(intent.amount_received / 100, locale)],
  ];

  await sendEmail({
    to: { email: to },
    ...renderEmail({
      locale,
      subject: eventName
        ? t(k("subject"), { event: eventName })
        : t(k("subjectNoEvent")),
      preheader: t(k("preheader")),
      heading: t(k("heading")),
      intro: [t(k(`reasons.${reason}`)), t(k("timing"))],
      rows,
      // Back to the race when it still takes sign-ups; a confirmed runner
      // (`duplicate`) lands on their registration there too.
      cta:
        event && event.status === "published"
          ? {
              label: t(k(reason === "duplicate" ? "ctaView" : "ctaRegister")),
              url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
            }
          : undefined,
      footer: t(k("footer")),
    }),
    tags: ["payment-refunded"],
  });
}

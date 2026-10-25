/**
 * Logging the failures someone has to act on.
 *
 * The app reports to the hosting platform's logs (Vercel's), with no
 * monitoring service. Most errors are logged as they happen with
 * `console.error`; the ones that mean money, a runner or the team is left
 * waiting go through `logCritical`, which writes one line that always starts
 * with "CRITICAL" followed by JSON:
 *
 *   CRITICAL {"code":"REFUND_FAILED","message":"…","paymentIntent":"pi_…"}
 *
 * so they can be found with a single search, and a log drain or alert can
 * match on them. `code` is stable; search by it to see every occurrence.
 *
 * Never put personal data in `details`: no email addresses, names, phone
 * numbers or payment card details. Ids (registration, PaymentIntent, user,
 * outbox row) are enough to look the rest up.
 */

export type CriticalCode =
  /** A Stripe refund failed; the runner is still charged. */
  | "REFUND_FAILED"
  /** A runner's bank disputed a payment; it needs answering in Stripe. */
  | "PAYMENT_DISPUTED"
  /** An outbox email used up its retries and will not be sent. */
  | "EMAIL_GAVE_UP"
  /** A deletion request, or its withdrawal, did not reach the team. */
  | "DELETION_REQUEST_NOT_EMAILED"
  | "DELETION_CANCELLATION_NOT_EMAILED"
  /** Rate limiting could not count; production is refusing the calls. */
  | "RATE_LIMIT_UNAVAILABLE"
  /** Production is running without NEXT_PUBLIC_SITE_URL, or with none at all. */
  | "SITE_URL_MISSING";

export function logCritical(
  code: CriticalCode,
  message: string,
  details: Record<string, unknown> = {},
): void {
  console.error(`CRITICAL ${JSON.stringify({ code, message, ...details })}`);
}

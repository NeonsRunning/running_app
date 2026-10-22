/**
 * ATH Móvil: paying the platform's ATH Móvil Business account by hand.
 *
 * There is no API behind this. The payment step shows the business path and
 * QR code, the runner sends the money from the ATH Móvil app and types in the
 * reference number from their receipt, and the event's organizer later finds
 * the payment in the ATH Móvil Business app and confirms the sign-up from the
 * event page (platform admins can too, from /admin/payments). The SQL side
 * lives in `supabase/migrations/20261026120000_ath_movil_payments.sql` and
 * `20261027120000_organizer_payment_review.sql`.
 *
 * Both values are public — they are printed on the payment step — so they are
 * read from `NEXT_PUBLIC_` variables, and this module is safe on either side.
 * ATH Móvil is offered only when the path is set.
 */

/** The business path runners search for in the app, e.g. "/NeonsRunning". */
const PATH = process.env.NEXT_PUBLIC_ATH_MOVIL_PATH?.trim() ?? "";

/**
 * The QR code exported from the ATH Móvil Business app: a path under
 * `public/` ("/payments/ath-movil-qr.png") or an absolute URL. Optional.
 */
const QR = process.env.NEXT_PUBLIC_ATH_MOVIL_QR_URL?.trim() ?? "";

export function athMovilConfigured(): boolean {
  return PATH !== "";
}

export function athMovilPath(): string {
  return PATH.startsWith("/") ? PATH : `/${PATH}`;
}

export function athMovilQrUrl(): string | null {
  return QR || null;
}

/** Longest reference a runner may type; the `registrations` table checks it. */
export const MAX_REFERENCE_LENGTH = 40;

/**
 * A short code the runner writes in the ATH Móvil message, so a reviewer can
 * match the payment to the sign-up at a glance: "NR-3F9A1C".
 */
export function paymentCode(registrationId: string): string {
  return `NR-${registrationId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** How long runners are told verification can take. */
export const REVIEW_HOURS = 48;

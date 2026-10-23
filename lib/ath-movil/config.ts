import { hasSupabaseEnv, supabaseEnv } from "@/lib/supabase/env";

/**
 * ATH Móvil: paying an ATH Móvil Business account by hand.
 *
 * There is no API behind this. A platform admin lists each business account
 * — its path and the QR code exported from the ATH Móvil Business app — at
 * /admin/payments/accounts, and the organizer picks one per event in the
 * publish wizard. The payment step shows that account's path and QR code,
 * the runner sends the money from the ATH Móvil app and types in the
 * reference number from their receipt, and the event's organizer later finds
 * the payment in the ATH Móvil Business app and confirms the sign-up from the
 * event page (platform admins can too, from /admin/payments). The SQL side
 * lives in `supabase/migrations/20261026120000_ath_movil_payments.sql`,
 * `20261027120000_organizer_payment_review.sql` and
 * `20261103120000_ath_movil_accounts.sql`.
 *
 * Shared by client and server, so nothing here may import server code.
 */

/** An ATH Móvil Business account runners can pay into. */
export type AthMovilAccount = {
  id: string;
  /** What organizers pick from: "NEONS RUNNING". */
  label: string;
  /** The business path runners search for in the app: "/NeonsRunning". */
  path: string;
  /** Public URL of the account's QR code; absent without one. */
  qrUrl?: string;
};

/** Public bucket holding the QR codes, uploaded as-is from the admin page. */
export const ATH_MOVIL_QR_BUCKET = "ath-movil-qr";

/** Mirrors the bucket's `file_size_limit`. */
export const ATH_MOVIL_QR_MAX_BYTES = 2 * 1024 * 1024;

/** The bucket's `allowed_mime_types`, with the extension each is stored under. */
export const ATH_MOVIL_QR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Mirrors the `path` check on `ath_movil_accounts`. */
export const ATH_MOVIL_PATH = /^\/[A-Za-z0-9._-]{1,60}$/;

/** Longest account label; the table checks it. */
export const MAX_LABEL_LENGTH = 80;

/** Public URL of a stored QR code, or undefined without one. */
export function athMovilQrUrl(path: string | null | undefined): string | undefined {
  if (!path || !hasSupabaseEnv()) return undefined;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${ATH_MOVIL_QR_BUCKET}/${path}`;
}

/** A stored account row in the shape the pages render. */
export function toAthMovilAccount(row: {
  id: string;
  label: string;
  path: string;
  qr_path: string | null;
}): AthMovilAccount {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    qrUrl: athMovilQrUrl(row.qr_path),
  };
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

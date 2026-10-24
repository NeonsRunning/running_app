import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request to a `/api/cron/*` route carries the shared secret, as
 * `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it by itself).
 * Without the secret set, every request is refused: these routes are open to
 * the internet. Compared in constant time, so the secret cannot be guessed a
 * character at a time.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

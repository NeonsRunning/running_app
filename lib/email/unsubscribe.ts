import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { isLocale, localizePath, type Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";
import type { Email } from "./brevo";
import type { EmailContent } from "./layout";
import type { EmailPreference } from "./recipient";

/**
 * The way out of the emails a runner can switch off — race reminders, result
 * reviews, race-day changes (`EmailPreference`). Each carries two:
 *
 *   a footer link     to the email switches in settings, for a runner who
 *                     wants to choose
 *   List-Unsubscribe  the header mail apps put behind their own
 *                     "Unsubscribe" button. It points at
 *                     `/api/email/unsubscribe`, which takes the one-click
 *                     POST of RFC 8058 and switches that one email off,
 *                     with no sign-in; opened in a browser, it goes to
 *                     settings instead, as a link scanner must not
 *                     unsubscribe anyone.
 *
 * The one-click URL names the account and the email and is signed: an HMAC
 * over both, keyed by a secret derived from the service role key, which only
 * the server holds. Nobody can switch off someone else's emails by guessing
 * an id. Rotating that key invalidates links already sent; their footer
 * links to settings still work.
 *
 * Emails about money or a held spot carry neither: they always go.
 */

export const EMAIL_SETTINGS_PATH = `${SELF_PROFILE_PATH}/settings`;
export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

const PREFERENCES: readonly EmailPreference[] = ["reminders", "results", "updates"];

export function isEmailPreference(value: unknown): value is EmailPreference {
  return PREFERENCES.includes(value as EmailPreference);
}

/** The signing key, kept apart from any other use of the service role key. */
function signingKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update("neons-email-unsubscribe-v1").digest();
}

/** The signature over one account's one email, or null with no key to sign. */
export function unsubscribeToken(userId: string, preference: EmailPreference): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`${userId}\n${preference}`).digest("base64url");
}

export function verifyUnsubscribeToken(
  userId: string,
  preference: EmailPreference,
  token: string,
): boolean {
  const expected = unsubscribeToken(userId, preference);
  if (!expected) return false;
  const [a, b] = [Buffer.from(expected), Buffer.from(token)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What an optional email adds: the footer link for `renderEmail`, and the
 * header for `sendEmail`. Spread `manage` into the content and
 * `listUnsubscribe` into the email.
 */
export function optionalEmailLinks({
  origin,
  locale,
  t,
  userId,
  preference,
}: {
  origin: string;
  locale: Locale;
  t: Translate;
  /** The account the email goes to. */
  userId: string;
  preference: EmailPreference;
}): {
  manage: NonNullable<EmailContent["manage"]>;
  listUnsubscribe: NonNullable<Email["listUnsubscribe"]>;
} {
  const settingsUrl = `${origin}${localizePath(EMAIL_SETTINGS_PATH, locale)}`;
  const token = unsubscribeToken(userId, preference);
  const oneClickUrl = token
    ? `${origin}${UNSUBSCRIBE_PATH}?${new URLSearchParams({
        u: userId,
        p: preference,
        t: token,
        l: locale,
      })}`
    : null;
  return {
    manage: { label: t("emails.common.manage"), url: settingsUrl },
    listUnsubscribe: oneClickUrl
      ? { url: oneClickUrl, oneClick: true }
      : { url: settingsUrl, oneClick: false },
  };
}

/** The locale named in an unsubscribe URL, when it is one. */
export function localeParam(value: string | null): Locale | null {
  return value && isLocale(value) ? value : null;
}

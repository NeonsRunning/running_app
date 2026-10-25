import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, localizePath } from "@/lib/i18n/config";
import {
  EMAIL_SETTINGS_PATH,
  isEmailPreference,
  localeParam,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe";
import type { EmailPreference } from "@/lib/email/recipient";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The `List-Unsubscribe` address on the emails a runner can switch off
 * (lib/email/unsubscribe.ts), with the account, the email and a signature in
 * the query string.
 *
 *   POST  the one-click unsubscribe of RFC 8058, sent by the mail app when
 *         the runner presses its "Unsubscribe" button: switches that one
 *         email off, with no session — the signature is the proof.
 *   GET   someone opened the address itself, or a link scanner did: never
 *         unsubscribes, only sends them to the email switches in settings.
 */

/** The switch each email has in `profile_private`, turned off. */
const OFF = {
  reminders: { email_reminders: false },
  results: { email_results: false },
  updates: { email_updates: false },
} satisfies Record<EmailPreference, object>;

export async function GET(request: NextRequest) {
  const locale = localeParam(request.nextUrl.searchParams.get("l")) ?? DEFAULT_LOCALE;
  return Response.redirect(
    new URL(localizePath(EMAIL_SETTINGS_PATH, locale), request.nextUrl.origin),
    303,
  );
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const userId = params.get("u") ?? "";
  const preference = params.get("p");
  const token = params.get("t") ?? "";
  if (!userId || !isEmailPreference(preference) || !verifyUnsubscribeToken(userId, preference, token)) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("profile_private")
    .update(OFF[preference])
    .eq("id", userId);
  if (error) {
    console.error(`Unsubscribing ${userId} from ${preference} failed:`, error.message);
    return new Response("Could not unsubscribe; try again later.", { status: 500 });
  }

  return new Response("Unsubscribed.", {
    headers: { "Cache-Control": "no-store" },
  });
}

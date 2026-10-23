import "server-only";
import { after } from "next/server";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { escape, siteOrigin } from "./registration-confirmed";

/**
 * "Your event was removed" — the email an organizer gets when a platform
 * admin takes one of their events down, with the admin's reason.
 *
 * Runs after the response with `after()`, so the admin page never waits on
 * Brevo and an email failure never undoes a removal. The organizer's address
 * lives on their auth record, read with the service role. Written in the
 * language the organizer last used.
 */

type Event = Tables<"events">;

export async function scheduleEventRemovedEmail(
  event: Event,
  reason: string,
): Promise<void> {
  if (!hasBrevoEnv()) return;

  const origin = await siteOrigin();
  after(() =>
    sendEventRemovedEmail(event, reason, origin).catch((err) => {
      console.error(`Removal email for event ${event.id} failed:`, err);
    }),
  );
}

async function sendEventRemovedEmail(event: Event, reason: string, origin: string) {
  const admin = createAdminClient();
  const [{ data: user }, { data: profile }, { data: prefs }] = await Promise.all([
    admin.auth.admin.getUserById(event.organizer_id),
    admin.from("profiles").select("full_name").eq("id", event.organizer_id).maybeSingle(),
    admin
      .from("profile_private")
      .select("locale")
      .eq("id", event.organizer_id)
      .maybeSingle(),
  ]);
  const to = user?.user?.email;
  if (!to) throw new Error("The organizer has no email address.");

  const locale = prefs && isLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE;
  const name = profile?.full_name ?? "";
  const email = await composeEmail({
    eventName: event.name,
    name,
    reason,
    locale,
    contactUrl: `${origin}${localizePath("/contact", locale)}`,
  });

  await sendEmail({
    to: { email: to, name: name || undefined },
    ...email,
    tags: ["event-removed"],
  });
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const INK = "#050505";
const LIME = "#9cff00";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";

async function composeEmail({
  eventName,
  name,
  reason,
  locale,
  contactUrl,
}: {
  eventName: string;
  name: string;
  reason: string;
  locale: Locale;
  contactUrl: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const t = await getTranslator(locale);
  const k = (key: string) => `emails.eventRemoved.${key}`;

  const subject = t(k("subject"), { event: eventName });
  const heading = name ? t(k("heading"), { name }) : t(k("headingNoName"));
  const intro = t(k("intro"), { event: eventName });
  const kept = t(k("kept"));
  const reasonLabel = t(k("reason"));
  const cta = t(k("cta"));
  const footer = t(k("footer"));

  const text = [
    heading,
    "",
    intro,
    "",
    `${reasonLabel}: ${reason}`,
    "",
    kept,
    "",
    `${cta}: ${contactUrl}`,
    "",
    footer,
  ].join("\n");

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${INK};padding:20px 28px;color:${LIME};font-size:15px;font-weight:800;letter-spacing:2px;">NEONS RUNNING</td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 12px;color:${INK};font-size:26px;line-height:1.2;">${escape(heading)}</h1>
          <p style="margin:0;color:#333333;font-size:15px;line-height:1.5;">${escape(intro)}</p>
        </td></tr>
        <tr><td style="padding:20px 28px;">
          <div style="border-top:1px solid ${LINE};padding-top:14px;color:${MUTED};font-size:13px;">${escape(reasonLabel)}</div>
          <p style="margin:6px 0 0;color:${INK};font-size:15px;font-weight:600;line-height:1.5;white-space:pre-line;">${escape(reason)}</p>
        </td></tr>
        <tr><td style="padding:0 28px 8px;">
          <p style="margin:0;color:#333333;font-size:15px;line-height:1.5;">${escape(kept)}</p>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;">
          <a href="${escape(contactUrl)}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">${escape(cta)}</a>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.5;">${escape(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

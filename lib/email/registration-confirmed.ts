import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { clock } from "@/lib/events/queries";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/i18n/config";
import { formatClock, formatLongDate, formatMoney } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";

/**
 * "You're in" — the email a runner gets once their payment confirms a
 * registration.
 *
 * `settlePayment()` schedules it for every confirmation it sees, and more
 * than one caller can see the same one, so sending is claimed first: the
 * update that sets `confirmation_email_sent_at` while it is still null wins,
 * and only the winner sends. A send that fails gives the claim back.
 *
 * Runs after the response with `after()`, so neither the confirmation screen
 * nor the webhook waits on Brevo, and an email failure never turns into a
 * failed sign-up. Written in the language the runner last registered in.
 */

type Registration = Tables<"registrations">;

/**
 * Where the email's links point. `NEXT_PUBLIC_SITE_URL` wins; otherwise the
 * request that confirmed the payment says which host we are — the webhook is
 * addressed to it too. Read before `after()`: a page render cannot read
 * headers from inside the callback.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function scheduleRegistrationEmail(
  registration: Registration,
): Promise<void> {
  if (!hasBrevoEnv() || registration.confirmation_email_sent_at) return;

  const origin = await siteOrigin();
  after(() =>
    sendRegistrationEmail(registration.id, origin).catch((err) => {
      console.error(`Confirmation email for ${registration.id} failed:`, err);
    }),
  );
}

async function sendRegistrationEmail(registrationId: string, origin: string) {
  const admin = createAdminClient();

  const { data: claimed } = await admin
    .from("registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("status", "confirmed")
    .is("confirmation_email_sent_at", null)
    .select("*")
    .maybeSingle();
  // Sent already, or being sent by another caller.
  if (!claimed) return;

  try {
    const [{ data: event }, { data: category }, { data: profile }] =
      await Promise.all([
        admin
          .from("events")
          .select(
            "name, slug, event_date, end_date, start_time, venue, city, donation_recipient",
          )
          .eq("id", claimed.event_id)
          .single(),
        admin
          .from("event_categories")
          .select("distance, start_time")
          .eq("id", claimed.category_id)
          .single(),
        admin
          .from("profile_private")
          .select("locale")
          .eq("id", claimed.runner_id)
          .maybeSingle(),
      ]);
    if (!event || !category) throw new Error("Event or category not found.");

    const locale =
      profile && isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE;
    const email = await composeEmail({
      registration: claimed,
      event,
      category,
      locale,
      eventUrl: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
    });

    await sendEmail({
      to: {
        email: claimed.email,
        name: `${claimed.first_name} ${claimed.last_name}`,
      },
      ...email,
      tags: ["registration-confirmed"],
    });
  } catch (err) {
    // Give the claim back so the next confirmation of this payment retries.
    await admin
      .from("registrations")
      .update({ confirmation_email_sent_at: null })
      .eq("id", registrationId);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const INK = "#050505";
const LIME = "#9cff00";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function composeEmail({
  registration,
  event,
  category,
  locale,
  eventUrl,
}: {
  registration: Registration;
  event: Pick<
    Tables<"events">,
    | "name"
    | "event_date"
    | "end_date"
    | "start_time"
    | "venue"
    | "city"
    | "donation_recipient"
  >;
  category: Pick<Tables<"event_categories">, "distance" | "start_time">;
  locale: Locale;
  eventUrl: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const t = await getTranslator(locale);
  const k = (key: string) => `emails.registrationConfirmed.${key}`;
  const bib = String(registration.bib ?? "");

  const extras = [
    registration.shirt_size
      ? t(k("shirt"), { size: registration.shirt_size })
      : null,
    registration.wants_photos ? t(k("photos")) : null,
    Number(registration.donation) > 0
      ? `${
          event.donation_recipient
            ? t(k("donationTo"), { recipient: event.donation_recipient })
            : t(k("donation"))
        } · ${formatMoney(Number(registration.donation), locale)}`
      : null,
  ].filter((v): v is string => v !== null);

  const location = [event.venue, event.city].filter(Boolean).join(", ");
  // A category without its own time starts with the event; an event without
  // one runs any time across its dates, or has not announced it yet.
  const startTime = category.start_time ?? event.start_time;
  const start = startTime
    ? formatClock(clock(startTime), locale)
    : t(event.end_date ? "labels.start.anytime" : "labels.start.tba");

  /** Label and value, in the order they read. Missing values are left out. */
  const rows: [string, string][] = [
    [t(k("race")), event.name],
    [t(k("distance")), distanceLabel(t, category.distance)],
    ...(event.event_date
      ? [[t(k("date")), formatLongDate(event.event_date, locale)] as [string, string]]
      : []),
    [t(k("start")), start],
    ...(location ? [[t(k("location")), location] as [string, string]] : []),
    ...(extras.length ? [[t(k("extras")), extras.join(" · ")] as [string, string]] : []),
    [t(k("total")), formatMoney(Number(registration.amount), locale)],
  ];

  const subject = t(k("subject"), { event: event.name });
  const heading = t(k("heading"), { name: registration.first_name });
  const intro = t(k("intro"), { event: event.name });
  const cta = t(k("cta"));
  const footer = t(k("footer"), { event: event.name });

  const text = [
    heading,
    "",
    intro,
    "",
    `${t(k("bib"))}: ${bib}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `${cta}: ${eventUrl}`,
    "",
    footer,
  ].join("\n");

  const rowHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${LINE};color:${MUTED};font-size:13px;width:38%;vertical-align:top;">${escape(label)}</td>
          <td style="padding:10px 0;border-top:1px solid ${LINE};color:${INK};font-size:14px;font-weight:600;vertical-align:top;">${escape(value)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${escape(t(k("preheader"), { bib }))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${INK};padding:20px 28px;color:${LIME};font-size:15px;font-weight:800;letter-spacing:2px;">NEONS RUNNING</td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 12px;color:${INK};font-size:26px;line-height:1.2;">${escape(heading)}</h1>
          <p style="margin:0;color:#333333;font-size:15px;line-height:1.5;">${escape(intro)}</p>
        </td></tr>
        <tr><td style="padding:20px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:10px;">
            <tr><td style="padding:18px 22px;">
              <div style="color:${LIME};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${escape(t(k("bib")))}</div>
              <div style="color:#ffffff;font-size:44px;font-weight:800;line-height:1.1;margin-top:4px;">${escape(bib)}</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;">
          <a href="${escape(eventUrl)}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">${escape(cta)}</a>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.5;">${escape(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getLocaleOf } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

/**
 * "Your kit is on its way" — the email a runner who chose "send by mail"
 * gets when the organizer marks their kit shipped, with the address and the
 * tracking number if one was given.
 *
 * Marking again only updates the tracking number, so sending is claimed: the
 * update that sets `shipping_email_sent_at` while it is still null wins, and
 * a failed send gives the claim back for the next marking to retry.
 */

type Registration = Tables<"registrations">;

export async function scheduleKitShippedEmail(registration: Registration): Promise<void> {
  if (!hasBrevoEnv() || registration.shipping_email_sent_at) return;

  const origin = await siteOrigin();
  after(() =>
    sendKitShippedEmail(registration.id, origin).catch((err) => {
      console.error(`Kit shipped email for ${registration.id} failed:`, err);
    }),
  );
}

async function sendKitShippedEmail(registrationId: string, origin: string) {
  const admin = createAdminClient();

  const { data: claimed } = await admin
    .from("registrations")
    .update({ shipping_email_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .not("shipped_at", "is", null)
    .is("shipping_email_sent_at", null)
    .select("*")
    .maybeSingle();
  // Sent already, or being sent by another marking.
  if (!claimed) return;

  try {
    const [{ data: event }, locale] = await Promise.all([
      admin.from("events").select("name, slug").eq("id", claimed.event_id).single(),
      getLocaleOf(claimed.runner_id),
    ]);
    if (!event) throw new Error("Event not found.");

    const t = await getTranslator(locale);
    const k = (key: string) => `emails.kitShipped.${key}`;
    const address = (claimed.mailing_address ?? "")
      .split(/\s*\n\s*/)
      .filter(Boolean)
      .join(", ");

    await sendEmail({
      to: { email: claimed.email, name: `${claimed.first_name} ${claimed.last_name}` },
      ...renderEmail({
        locale,
        subject: t(k("subject"), { event: event.name }),
        preheader: t(k("preheader")),
        heading: t(k("heading"), { name: claimed.first_name }),
        intro: [t(k("intro"), { event: event.name })],
        rows: [
          [t(k("race")), event.name],
          ...(claimed.bib ? [[t(k("bib")), String(claimed.bib)] as [string, string]] : []),
          ...(address ? [[t(k("mailTo")), address] as [string, string]] : []),
          ...(claimed.shipping_tracking
            ? [[t(k("tracking")), claimed.shipping_tracking] as [string, string]]
            : []),
        ],
        outro: [t(k(claimed.shipping_tracking ? "next" : "nextNoTracking"))],
        cta: {
          label: t(k("cta")),
          url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
        },
        footer: t(k("footer"), { event: event.name }),
      }),
      tags: ["kit-shipped"],
    });
  } catch (err) {
    // Give the claim back so marking it again retries.
    await admin
      .from("registrations")
      .update({ shipping_email_sent_at: null })
      .eq("id", registrationId);
    throw err;
  }
}

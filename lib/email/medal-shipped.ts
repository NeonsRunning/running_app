import "server-only";
import { after } from "next/server";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { localizePath } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getLocaleOf } from "./recipient";
import { siteOrigin } from "@/lib/site-url";

/**
 * "Your finisher medal is on its way" — the email a finisher gets when the
 * organizer marks their medal shipped, with the address and the tracking
 * number if one was given. The kit's email (`kit-shipped.ts`) is its twin.
 *
 * Marking again only updates the tracking number, so sending is claimed: the
 * update that sets `medal_email_sent_at` while it is still null wins, and a
 * failed send gives the claim back for the next marking to retry.
 */

type Registration = Tables<"registrations">;

export async function scheduleMedalShippedEmail(registration: Registration): Promise<void> {
  if (!hasBrevoEnv() || registration.medal_email_sent_at) return;

  const origin = await siteOrigin();
  after(() =>
    sendMedalShippedEmail(registration.id, origin).catch((err) => {
      console.error(`Medal shipped email for ${registration.id} failed:`, err);
    }),
  );
}

async function sendMedalShippedEmail(registrationId: string, origin: string) {
  const admin = createAdminClient();

  const { data: claimed } = await admin
    .from("registrations")
    .update({ medal_email_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .not("medal_shipped_at", "is", null)
    .is("medal_email_sent_at", null)
    .select("*")
    .maybeSingle();
  // Sent already, or being sent by another marking.
  if (!claimed) return;

  try {
    const [{ data: event }, locale] = await Promise.all([
      admin.from("events").select("name").eq("id", claimed.event_id).single(),
      getLocaleOf(claimed.runner_id),
    ]);
    if (!event) throw new Error("Event not found.");

    const t = await getTranslator(locale);
    const k = (key: string) => `emails.medalShipped.${key}`;
    const address = (claimed.medal_mailing_address ?? "")
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
          ...(address ? [[t(k("mailTo")), address] as [string, string]] : []),
          ...(claimed.medal_tracking
            ? [[t(k("tracking")), claimed.medal_tracking] as [string, string]]
            : []),
        ],
        outro: [t(k(claimed.medal_tracking ? "next" : "nextNoTracking"))],
        // The profile keeps the tracking number once this email is buried.
        cta: {
          label: t(k("cta")),
          url: `${origin}${localizePath(SELF_PROFILE_PATH, locale)}#mail`,
        },
        footer: t(k("footer"), { event: event.name }),
      }),
      tags: ["medal-shipped"],
    });
  } catch (err) {
    // Give the claim back so marking it again retries.
    await admin
      .from("registrations")
      .update({ medal_email_sent_at: null })
      .eq("id", registrationId);
    throw err;
  }
}

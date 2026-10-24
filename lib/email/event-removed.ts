import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getRecipient } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

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
  const { email: to, name, locale } = await getRecipient(event.organizer_id);
  if (!to) throw new Error("The organizer has no email address.");

  const t = await getTranslator(locale);
  const k = (key: string) => `emails.eventRemoved.${key}`;

  await sendEmail({
    to: { email: to, name: name || undefined },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name }),
      heading: name ? t(k("heading"), { name }) : t(k("headingNoName")),
      intro: [t(k("intro"), { event: event.name })],
      note: { label: t(k("reason")), body: reason },
      outro: [t(k("kept"))],
      cta: {
        label: t(k("cta")),
        url: `${origin}${localizePath("/contact", locale)}`,
      },
      footer: t(k("footer")),
    }),
    tags: ["event-removed"],
  });
}

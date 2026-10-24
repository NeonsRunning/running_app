import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { formatLongDate } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import { puertoRicoToday } from "@/lib/results/evidence";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail, type Email } from "./brevo";
import { queueEmails } from "./outbox";
import { renderEmail } from "./layout";
import { getConfirmedRunners, getRecipient } from "./recipient";
import { siteOrigin } from "@/lib/site-url";

/**
 * "Your event is back" — sent when a platform admin restores a removed
 * event. Its organizer always hears; its confirmed runners hear too when
 * the race has not been run yet, since they were told it was cancelled
 * (`event-cancelled.ts`). Anyone refunded meanwhile is asked to get in
 * touch, as their spot still shows as theirs.
 */

type Event = Tables<"events">;

export async function scheduleEventRestoredEmails(event: Event): Promise<void> {
  if (!hasBrevoEnv()) return;

  const upcoming = !event.last_day || event.last_day >= puertoRicoToday();
  const origin = await siteOrigin();
  const eventPath = `/events/${event.slug}`;
  after(async () => {
    await sendOrganizerEmail(event, origin, eventPath).catch((err) => {
      console.error(`Restore email for event ${event.id} failed:`, err);
    });
    if (upcoming) {
      await sendRunnerEmails(event, origin, eventPath).catch((err) => {
        console.error(`Reinstated emails for event ${event.id} failed:`, err);
      });
    }
  });
}

async function sendOrganizerEmail(event: Event, origin: string, eventPath: string) {
  const { email: to, name, locale } = await getRecipient(event.organizer_id);
  if (!to) throw new Error("The organizer has no email address.");

  const t = await getTranslator(locale);
  const k = (key: string) => `emails.eventRestored.${key}`;

  await sendEmail({
    to: { email: to, name: name || undefined },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name }),
      heading: name ? t(k("heading"), { name }) : t(k("headingNoName")),
      intro: [t(k("intro"), { event: event.name })],
      cta: { label: t(k("cta")), url: `${origin}${localizePath(eventPath, locale)}` },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: ["event-restored"],
  });
}

async function sendRunnerEmails(event: Event, origin: string, eventPath: string) {
  const runners = await getConfirmedRunners(event.id);
  const emails: Email[] = [];

  for (const { locale, ...runner } of runners) {
    const t = await getTranslator(locale);
    const k = (key: string) => `emails.eventReinstated.${key}`;

    emails.push({
      to: { email: runner.email, name: runner.name },
      ...renderEmail({
        locale,
        subject: t(k("subject"), { event: event.name }),
        preheader: t(k("preheader")),
        heading: t(k("heading"), { name: runner.firstName }),
        intro: [t(k("intro"), { event: event.name })],
        rows: [
          [t(k("race")), event.name],
          ...(event.event_date
            ? [[t(k("date")), formatLongDate(event.event_date, locale)] as [string, string]]
            : []),
        ],
        outro: [t(k("refunded"))],
        cta: { label: t(k("cta")), url: `${origin}${localizePath(eventPath, locale)}` },
        footer: t(k("footer"), { event: event.name }),
      }),
      tags: ["event-reinstated"],
    });
  }

  // Through the outbox: retried until every runner has it.
  await queueEmails(emails);
}

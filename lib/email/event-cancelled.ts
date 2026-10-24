import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { formatLongDate, formatMoney } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import { puertoRicoToday } from "@/lib/results/evidence";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmails, type Email } from "./brevo";
import { renderEmail } from "./layout";
import { getConfirmedRunners } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

/**
 * "Your race was cancelled" — the email every confirmed runner gets when a
 * platform admin removes a race that has not been run yet. Refunds stay a
 * manual step, so it promises no amount or date: it tells them what they
 * paid and that we will be in touch about their options, as the
 * cancellation policy says. The admin's reason is written for the organizer
 * and is not repeated here.
 *
 * A race already run is only hidden; its runners are not written to.
 */

type Event = Tables<"events">;

export async function scheduleEventCancelledEmails(event: Event): Promise<void> {
  if (!hasBrevoEnv()) return;
  if (event.last_day && event.last_day < puertoRicoToday()) return;

  const origin = await siteOrigin();
  after(() =>
    sendEventCancelledEmails(event, origin).catch((err) => {
      console.error(`Cancellation emails for event ${event.id} failed:`, err);
    }),
  );
}

async function sendEventCancelledEmails(event: Event, origin: string) {
  const runners = await getConfirmedRunners(event.id);
  const emails: Email[] = [];

  for (const { locale, ...runner } of runners) {
    const t = await getTranslator(locale);
    const k = (key: string) => `emails.eventCancelled.${key}`;

    const rows: [string, string][] = [
      [t(k("race")), event.name],
      ...(event.event_date
        ? [[t(k("date")), formatLongDate(event.event_date, locale)] as [string, string]]
        : []),
      [t(k("paid")), formatMoney(runner.amount, locale)],
    ];

    emails.push({
      to: { email: runner.email, name: runner.name },
      ...renderEmail({
        locale,
        subject: t(k("subject"), { event: event.name }),
        preheader: t(k("preheader")),
        heading: t(k("heading"), { name: runner.firstName }),
        intro: [t(k("intro"), { event: event.name })],
        rows,
        outro: [t(k("refund"))],
        cta: {
          label: t(k("cta")),
          url: `${origin}${localizePath("/contact", locale)}`,
        },
        footer: t(k("footer"), { event: event.name }),
      }),
      tags: ["event-cancelled"],
    });
  }

  const failed = await sendEmails(emails);
  if (failed) {
    console.error(`${failed} of ${emails.length} cancellation emails for ${event.id} failed.`);
  }
}

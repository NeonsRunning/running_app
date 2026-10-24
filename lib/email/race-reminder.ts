import "server-only";
import { clock } from "@/lib/events/queries";
import { DEFAULT_LOCALE, localizePath } from "@/lib/i18n/config";
import { formatClock, formatLongDate } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { puertoRicoToday } from "@/lib/results/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getEmailSettingsOf } from "./recipient";

/**
 * "Your race is tomorrow" — the reminder every confirmed runner gets the day
 * before a published race starts, with their bib, start time and place.
 *
 * Sent by `/api/cron/race-reminders`, once a day. Each registration is
 * claimed first, as for the confirmation email: the update that sets
 * `reminder_email_sent_at` while it is still null wins, and a failed send
 * gives the claim back for the next run. A runner who switched reminders off
 * in settings is claimed and skipped.
 */

/** Rows handled per run; a later run picks up the rest. */
const BATCH = 500;

export async function sendRaceReminders(
  origin: string,
): Promise<{ sent: number; failed: number }> {
  if (!hasBrevoEnv()) return { sent: 0, failed: 0 };

  // "Tomorrow" on the island, where every race is dated.
  const tomorrow = new Date(`${puertoRicoToday()}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("registrations")
    .select(
      "id, runner_id, email, first_name, last_name, bib, events!inner(name, slug, status, event_date, end_date, start_time, anywhere, venue, city, region), event_categories(distance, start_time)",
    )
    .eq("status", "confirmed")
    .is("reminder_email_sent_at", null)
    .eq("events.event_date", date)
    .eq("events.status", "published")
    .limit(BATCH);
  if (error) throw new Error(error.message);
  if (!rows?.length) return { sent: 0, failed: 0 };

  const settings = await getEmailSettingsOf(rows.map((r) => r.runner_id));
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const { data: claimed } = await admin
      .from("registrations")
      .update({ reminder_email_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("reminder_email_sent_at", null)
      .select("id")
      .maybeSingle();
    // Sent by a run that overlapped this one.
    if (!claimed) continue;
    // Switched off in settings. The claim stays, so later runs skip the row.
    if (settings.get(row.runner_id)?.reminders === false) continue;

    try {
      const event = row.events;
      const category = row.event_categories;
      const locale = settings.get(row.runner_id)?.locale ?? DEFAULT_LOCALE;
      const t = await getTranslator(locale);
      const k = (key: string) => `emails.raceReminder.${key}`;

      const startTime = category?.start_time ?? event.start_time;
      const start = startTime
        ? formatClock(clock(startTime), locale)
        : t(event.end_date ? "labels.start.anytime" : "labels.start.tba");
      const location = event.anywhere
        ? t("events.anywhere.place", { region: event.region })
        : [event.venue, event.city].filter(Boolean).join(", ");

      const details: [string, string][] = [
        [t(k("race")), event.name],
        ...(row.bib ? [[t(k("bib")), String(row.bib)] as [string, string]] : []),
        ...(category
          ? [[t(k("distance")), distanceLabel(t, category.distance)] as [string, string]]
          : []),
        [t(k("date")), formatLongDate(date, locale)],
        [t(k("start")), start],
        ...(location ? [[t(k("location")), location] as [string, string]] : []),
      ];

      await sendEmail({
        to: { email: row.email, name: `${row.first_name} ${row.last_name}` },
        ...renderEmail({
          locale,
          subject: t(k("subject"), { event: event.name }),
          preheader: startTime ? t(k("preheader"), { start }) : t(k("preheaderNoTime")),
          heading: t(k("heading"), { name: row.first_name }),
          intro: [t(k("intro"), { event: event.name })],
          rows: details,
          outro: [t(k(event.anywhere ? "tipsAnywhere" : "tips"))],
          cta: {
            label: t(k("cta")),
            url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
          },
          footer: t(k("footer"), { event: event.name }),
        }),
        tags: ["race-reminder"],
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(`Race reminder for ${row.id} failed:`, err);
      await admin
        .from("registrations")
        .update({ reminder_email_sent_at: null })
        .eq("id", row.id);
    }
  }

  return { sent, failed };
}

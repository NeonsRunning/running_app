import "server-only";
import { addDays, puertoRicoToday } from "@/lib/dates";
import { clock } from "@/lib/events/queries";
import { DEFAULT_LOCALE, localizePath } from "@/lib/i18n/config";
import { formatClock, formatLongDate } from "@/lib/i18n/format";
import { distanceLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getEmailSettingsOf, type EmailSettings } from "./recipient";

/**
 * "Your race is tomorrow" — the reminder every confirmed runner gets the day
 * before a published race starts, with their bib, start time and place.
 *
 * Sent by `/api/cron/race-reminders`. Each registration is claimed first, as
 * for the confirmation email: the update that sets `reminder_email_sent_at`
 * while it is still null wins, so overlapping runs never send twice, and a
 * failed send gives the claim back for the next run. A runner who switched
 * reminders off in settings is claimed and skipped.
 *
 * One run works through every runner racing tomorrow, a batch at a time,
 * until none are left or its time is nearly up; then the next run carries on
 * from where the claims left off. Batches walk forward by id, so a failed send
 * is not retried in the same run — it waits for the next — and a run always
 * finishes.
 */

/** Rows read per query. */
const BATCH = 500;
/** Emails handed to Brevo at once. */
const CONCURRENCY = 5;
/**
 * When to stop starting new sends. The route may run for 300 seconds; a send
 * can take up to Brevo's 10-second timeout, so this leaves room to finish.
 */
const TIME_BUDGET_MS = 240_000;

type ReminderRow = Awaited<ReturnType<typeof readBatch>>[number];

function readBatch(date: string, after: string | null) {
  let query = createAdminClient()
    .from("registrations")
    .select(
      "id, runner_id, email, first_name, last_name, bib, events!inner(name, slug, status, event_date, end_date, start_time, anywhere, venue, city, region), event_categories(distance, start_time)",
    )
    .eq("status", "confirmed")
    .is("reminder_email_sent_at", null)
    .eq("events.event_date", date)
    .eq("events.status", "published")
    .order("id")
    .limit(BATCH);
  if (after) query = query.gt("id", after);
  return query.then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

export async function sendRaceReminders(
  origin: string,
): Promise<{ sent: number; failed: number; skipped: number; finished: boolean }> {
  const result = { sent: 0, failed: 0, skipped: 0, finished: true };
  if (!hasBrevoEnv()) return result;

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  // "Tomorrow" on the island, where every race is dated.
  const date = addDays(puertoRicoToday(), 1);

  let cursor: string | null = null;
  for (;;) {
    if (outOfTime()) {
      result.finished = false;
      break;
    }
    const rows = await readBatch(date, cursor);
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    const settings = await getEmailSettingsOf(rows.map((r) => r.runner_id));
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
        while (next < rows.length) {
          // Rows not yet claimed are left for the next run.
          if (outOfTime()) {
            result.finished = false;
            return;
          }
          const row = rows[next++];
          const outcome = await remind(row, settings.get(row.runner_id), date, origin);
          result[outcome]++;
        }
      }),
    );

    if (rows.length < BATCH) break;
  }

  return result;
}

/** Claim one registration's reminder and send it. */
async function remind(
  row: ReminderRow,
  settings: EmailSettings | undefined,
  date: string,
  origin: string,
): Promise<"sent" | "failed" | "skipped"> {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("registrations")
    .update({ reminder_email_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("reminder_email_sent_at", null)
    .select("id")
    .maybeSingle();
  // Sent by a run that overlapped this one.
  if (!claimed) return "skipped";
  // Switched off in settings. The claim stays, so later runs skip the row.
  if (settings?.reminders === false) return "skipped";

  try {
    const event = row.events;
    const category = row.event_categories;
    const locale = settings?.locale ?? DEFAULT_LOCALE;
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
    return "sent";
  } catch (err) {
    console.error(`Race reminder for ${row.id} failed:`, err);
    await admin
      .from("registrations")
      .update({ reminder_email_sent_at: null })
      .eq("id", row.id);
    return "failed";
  }
}

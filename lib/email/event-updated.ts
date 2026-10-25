import "server-only";
import { after } from "next/server";
import { clock } from "@/lib/events/queries";
import { localizePath, type Locale } from "@/lib/i18n/config";
import { formatClock, formatLongDate } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import { puertoRicoToday } from "@/lib/results/evidence";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail, type Email } from "./brevo";
import { queueEmails } from "./outbox";
import { renderEmail } from "./layout";
import { getConfirmedRunners, getRecipient } from "./recipient";
import { optionalEmailLinks } from "./unsubscribe";
import { siteOrigin } from "@/lib/site-url";

/**
 * What a save in the event wizard tells other people. Both compare the row
 * before the save with the one `save_event()` returned, so values read the
 * same on both sides.
 *
 *   edited by an admin   the organizer hears which wizard steps changed.
 *                        Categories are saved beside the row and are not
 *                        compared; a save that changed only them still says
 *                        the event was updated.
 *   race-day changes     confirmed runners of a published race still to come
 *                        hear when its date, start time or place changed,
 *                        with what it was and what it is now.
 *
 * Saves are explicit — "Save changes" in the wizard — so each one is worth a
 * message. Runs after the response with `after()`.
 */

type Event = Tables<"events">;

/** Wizard steps (keys under `publish.steps`) and the columns each holds. */
const STEP_COLUMNS: [string, (keyof Event)[]][] = [
  [
    "basic",
    [
      "name",
      "description",
      "type",
      "event_date",
      "end_date",
      "start_time",
      "registration_opens",
      "registration_closes",
    ],
  ],
  [
    "location",
    ["anywhere", "venue", "address", "city", "region", "postal_code", "country"],
  ],
  [
    "registration",
    ["capacity", "minimum_age", "maximum_age", "ath_movil_account_id"],
  ],
  [
    "extras",
    [
      "offers_shirt",
      "shirt_price",
      "shirt_sizes",
      "offers_photos",
      "photo_price",
      "accepts_donations",
      "donation_recipient",
      "offers_mail",
      "shipping_price",
    ],
  ],
  [
    "details",
    [
      "terrain",
      "difficulty",
      "elevation_gain",
      "cutoff",
      "aid_stations",
      "schedule",
      "parking",
      "directions",
    ],
  ],
  ["image", ["image_path"]],
  ["route", ["route_image_path"]],
  ["medal", ["medal_image_path", "accepts_results", "mails_medals"]],
];

const differs = (a: Event, b: Event, column: keyof Event) =>
  JSON.stringify(a[column]) !== JSON.stringify(b[column]);

export async function scheduleEventSavedEmails({
  before,
  saved,
  byAdmin,
}: {
  before: Event;
  saved: Event;
  /** The save was an admin's, on someone else's event. */
  byAdmin: boolean;
}): Promise<void> {
  if (!hasBrevoEnv()) return;

  const steps = STEP_COLUMNS.filter(([, cols]) =>
    cols.some((c) => differs(before, saved, c)),
  ).map(([step]) => step);

  const raceDayChanged =
    before.status === "published" &&
    saved.status === "published" &&
    !(saved.last_day && saved.last_day < puertoRicoToday()) &&
    (["event_date", "end_date", "start_time"].some((c) =>
      differs(before, saved, c as keyof Event),
    ) ||
      placeLine(before) !== placeLine(saved));

  if (!byAdmin && !raceDayChanged) return;

  const origin = await siteOrigin();
  after(async () => {
    if (byAdmin) {
      await sendAdminEditEmail(saved, steps, origin).catch((err) => {
        console.error(`Admin edit email for event ${saved.id} failed:`, err);
      });
    }
    if (raceDayChanged) {
      await sendRaceDayChangedEmails(before, saved, origin).catch((err) => {
        console.error(`Event change emails for ${saved.id} failed:`, err);
      });
    }
  });
}

async function sendAdminEditEmail(event: Event, steps: string[], origin: string) {
  const { email: to, name, locale } = await getRecipient(event.organizer_id);
  if (!to) throw new Error("The organizer has no email address.");

  const t = await getTranslator(locale);
  const k = (key: string) => `emails.eventEditedByAdmin.${key}`;

  await sendEmail({
    to: { email: to, name: name || undefined },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name }),
      heading: name ? t(k("heading"), { name }) : t(k("headingNoName")),
      intro: [t(k("intro"), { event: event.name })],
      rows: steps.length
        ? [[t(k("changed")), steps.map((s) => t(`publish.steps.${s}`)).join(", ")]]
        : undefined,
      outro: [t(k("next"))],
      cta: {
        label: t(k("cta")),
        url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
      },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: ["event-edited-by-admin"],
  });
}

/** Where the race happens, as one line. Empty for a race run anywhere. */
function placeLine(e: Event): string {
  return e.anywhere ? "" : [e.venue, e.address, e.city].filter(Boolean).join(", ");
}

function whenLine(e: Event, t: Translate, locale: Locale): string {
  const dates = [e.event_date, e.end_date]
    .filter((d): d is string => Boolean(d))
    .map((d) => formatLongDate(d, locale))
    .join(" – ");
  const start = e.start_time
    ? formatClock(clock(e.start_time), locale)
    : t(e.end_date ? "labels.start.anytime" : "labels.start.tba");
  return dates ? `${dates} · ${start}` : start;
}

function whereLine(e: Event, t: Translate): string {
  return e.anywhere ? t("events.anywhere.place", { region: e.region }) : placeLine(e);
}

async function sendRaceDayChangedEmails(before: Event, saved: Event, origin: string) {
  // "Event updates" in settings; a runner can switch these off.
  const runners = await getConfirmedRunners(saved.id, { only: "updates" });
  const emails: Email[] = [];

  for (const { locale, ...runner } of runners) {
    const t = await getTranslator(locale);
    const k = (key: string) => `emails.eventChanged.${key}`;
    const { manage, listUnsubscribe } = optionalEmailLinks({
      origin,
      locale,
      t,
      userId: runner.runnerId,
      preference: "updates",
    });

    const rows: [string, string][] = [];
    const [whenBefore, whenNow] = [whenLine(before, t, locale), whenLine(saved, t, locale)];
    if (whenBefore !== whenNow) {
      rows.push([t(k("whenNow")), whenNow], [t(k("whenBefore")), whenBefore]);
    }
    const [whereBefore, whereNow] = [whereLine(before, t), whereLine(saved, t)];
    if (whereBefore !== whereNow) {
      rows.push([t(k("whereNow")), whereNow], [t(k("whereBefore")), whereBefore]);
    }
    if (!rows.length) continue;

    emails.push({
      to: { email: runner.email, name: runner.name },
      ...renderEmail({
        locale,
        subject: t(k("subject"), { event: saved.name }),
        preheader: t(k("preheader")),
        heading: t(k("heading"), { name: runner.firstName }),
        intro: [t(k("intro"), { event: saved.name })],
        rows,
        outro: [t(k("next"))],
        cta: {
          label: t(k("cta")),
          url: `${origin}${localizePath(`/events/${saved.slug}`, locale)}`,
        },
        footer: t(k("footer"), { event: saved.name }),
        manage,
      }),
      tags: ["event-changed"],
      listUnsubscribe,
    });
  }

  // Through the outbox: retried until every runner has it.
  await queueEmails(emails);
}

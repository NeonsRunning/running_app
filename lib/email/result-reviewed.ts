import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { formatFinishTime } from "@/lib/results/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getEmailSettingOf } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

/**
 * The email a runner gets once the organizer — or an admin — reviews the
 * finish time they sent. Accepted: it is on their profile, with the event's
 * medal. Sent back: the reviewer's note, if any, and a link to send new
 * evidence from the race page.
 *
 * `review_race_result()` answers a pending result once, so no claim is
 * needed. Written to the address on the runner's registration.
 */

type Result = Tables<"race_results">;

export async function scheduleResultReviewedEmail(result: Result): Promise<void> {
  if (!hasBrevoEnv() || result.status === "pending") return;

  const origin = await siteOrigin();
  after(() =>
    sendResultReviewedEmail(result, origin).catch((err) => {
      console.error(`Result review email for ${result.id} failed:`, err);
    }),
  );
}

async function sendResultReviewedEmail(result: Result, origin: string) {
  const admin = createAdminClient();
  const [{ data: event }, { data: reg }, settings] = await Promise.all([
    admin.from("events").select("name, slug").eq("id", result.event_id).single(),
    admin
      .from("registrations")
      .select("email, first_name, last_name")
      .eq("id", result.registration_id)
      .single(),
    getEmailSettingOf(result.runner_id),
  ]);
  if (!event || !reg) throw new Error("Event or registration not found.");
  // "Results posted" in settings; the runner can switch it off. The result
  // itself shows on their race page either way.
  if (!settings.results) return;
  const { locale } = settings;

  const accepted = result.status === "accepted";
  const t = await getTranslator(locale);
  const k = (key: string) =>
    `emails.${accepted ? "resultAccepted" : "resultRejected"}.${key}`;

  await sendEmail({
    to: { email: reg.email, name: `${reg.first_name} ${reg.last_name}` },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name }),
      preheader: t(k("preheader")),
      heading: t(k("heading"), { name: reg.first_name }),
      intro: [t(k("intro"), { event: event.name })],
      rows: [
        [t(k("race")), event.name],
        [t(k("time")), formatFinishTime(result.finish_seconds)],
      ],
      note:
        !accepted && result.review_note
          ? { label: t(k("note")), body: result.review_note }
          : undefined,
      outro: [t(k("next"))],
      cta: {
        label: t(k("cta")),
        url: `${origin}${localizePath(
          accepted ? `/runners/${result.runner_id}` : `/events/${event.slug}`,
          locale,
        )}`,
      },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: [accepted ? "result-accepted" : "result-rejected"],
  });
}

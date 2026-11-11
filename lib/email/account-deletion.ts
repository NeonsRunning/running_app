import "server-only";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { puertoRicoToday } from "@/lib/results/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import { logCritical } from "@/lib/log";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getRecipient } from "./recipient";

/**
 * "A runner asked to delete their account" — to the team's inbox, which
 * carries the request out by hand (see the account_deletion_requests
 * migration for why it is not automatic).
 *
 * The email says what the account still holds, so the team can tell at a
 * glance whether anything has to be refunded or kept before deleting.
 *
 * Sent once per request, near enough: `team_notified_at` is written when the
 * email has gone, so a send that failed or never finished leaves the request
 * to be found (`team_notified_at is null`) and sent again. Awaited by the
 * caller, like the contact form: it goes to us, not to the runner.
 *
 * Resolves true once the team has been told, by this call or an earlier one.
 */
export async function notifyTeamOfDeletionRequest(userId: string): Promise<boolean> {
  const inbox = process.env.CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!hasBrevoEnv() || !inbox) {
    logCritical("DELETION_REQUEST_NOT_EMAILED", "Email is not configured; the team was not told.", {
      user: userId,
    });
    return false;
  }

  const admin = createAdminClient();
  // `team_notified_at` is written only once the email has gone, below. It
  // used to be written first, as a claim, and handed back on failure — but a
  // function cut off between the two (a timeout, a deploy) left the request
  // marked "told" for good, with nobody told. Two requests a moment apart can
  // now both send; a second copy in the team's own inbox is the cheaper
  // mistake.
  const { data: request } = await admin
    .from("account_deletion_requests")
    .select("requested_at, team_notified_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!request || request.team_notified_at) return true;

  try {
    const today = puertoRicoToday();
    const [recipient, { data: profile }, upcoming, paid, underReview, events] =
      await Promise.all([
        getRecipient(userId),
        admin.from("profiles").select("handle").eq("id", userId).maybeSingle(),
        admin
          .from("registrations")
          .select("id, event:events!inner(last_day)", { count: "exact", head: true })
          .eq("runner_id", userId)
          .eq("status", "confirmed")
          .gte("event.last_day", today),
        admin
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("runner_id", userId)
          .eq("status", "confirmed"),
        admin
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("runner_id", userId)
          .eq("status", "pending")
          .not("payment_submitted_at", "is", null),
        admin
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", userId),
      ]);

    const t = await getTranslator(DEFAULT_LOCALE);
    const k = (key: string) => `emails.accountDeletion.${key}`;
    const name = recipient.name || recipient.email || userId;
    const requestedAt = formatRequestedAt(request.requested_at);

    await sendEmail({
      to: { email: inbox },
      ...(recipient.email
        ? { replyTo: { email: recipient.email, name: recipient.name || undefined } }
        : {}),
      ...renderEmail({
        locale: DEFAULT_LOCALE,
        subject: t(k("subject"), { name }),
        heading: t(k("heading")),
        intro: [t(k("intro"))],
        rows: [
          [t(k("name")), recipient.name || "—"],
          [t(k("email")), recipient.email ?? "—"],
          [t(k("handle")), profile?.handle ? `@${profile.handle}` : "—"],
          [t(k("userId")), userId],
          [t(k("requestedAt")), requestedAt],
          [t(k("upcoming")), String(upcoming.count ?? 0)],
          [t(k("paid")), String(paid.count ?? 0)],
          [t(k("underReview")), String(underReview.count ?? 0)],
          [t(k("events")), String(events.count ?? 0)],
        ],
        note: { label: t(k("noteLabel")), body: t(k("note")) },
        footer: t(k("footer")),
      }),
      tags: ["account-deletion-request"],
    });
    const { error: markError } = await admin
      .from("account_deletion_requests")
      .update({ team_notified_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("team_notified_at", null);
    if (markError) {
      // Sent, but still listed as not told: the worst it costs is a second copy.
      console.error(`Marking the deletion request of ${userId} as sent failed:`, markError.message);
    }
    return true;
  } catch (err) {
    logCritical("DELETION_REQUEST_NOT_EMAILED", "Emailing the team failed; it can be sent again.", {
      user: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * "The runner withdrew their deletion request" — to the team's inbox, so
 * nobody carries out a request that is no longer wanted. Only sent when the
 * team had been told about the request in the first place.
 *
 * The request's row is already gone by now, so there is nothing to claim:
 * a failure is logged for a person to pass on.
 */
export async function notifyTeamOfDeletionCancelled(
  userId: string,
  requestedAt: string,
): Promise<void> {
  const inbox = process.env.CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!hasBrevoEnv() || !inbox) {
    logCritical("DELETION_CANCELLATION_NOT_EMAILED", "Email is not configured; the team was not told.", {
      user: userId,
    });
    return;
  }

  try {
    const recipient = await getRecipient(userId);
    const t = await getTranslator(DEFAULT_LOCALE);
    const k = (key: string) => `emails.accountDeletionCancelled.${key}`;
    const name = recipient.name || recipient.email || userId;

    await sendEmail({
      to: { email: inbox },
      ...(recipient.email
        ? { replyTo: { email: recipient.email, name: recipient.name || undefined } }
        : {}),
      ...renderEmail({
        locale: DEFAULT_LOCALE,
        subject: t(k("subject"), { name }),
        heading: t(k("heading")),
        intro: [t(k("intro"))],
        rows: [
          [t("emails.accountDeletion.name"), recipient.name || "—"],
          [t("emails.accountDeletion.email"), recipient.email ?? "—"],
          [t("emails.accountDeletion.userId"), userId],
          [t("emails.accountDeletion.requestedAt"), formatRequestedAt(requestedAt)],
        ],
        footer: t(k("footer")),
      }),
      tags: ["account-deletion-cancelled"],
    });
  } catch (err) {
    logCritical("DELETION_CANCELLATION_NOT_EMAILED", "Emailing the team failed; tell them by hand.", {
      user: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** When it was asked for, in the island's time, as the team reads it. */
function formatRequestedAt(iso: string): string {
  return new Intl.DateTimeFormat("es-PR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Puerto_Rico",
  }).format(new Date(iso));
}

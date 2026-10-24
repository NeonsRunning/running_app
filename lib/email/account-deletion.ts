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
 * Sent once per request: the update that sets `team_notified_at` while it is
 * still null wins, and a failed send gives the claim back, so the request can
 * be found (`team_notified_at is null`) and sent again. Awaited by the
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
  const { data: claimed } = await admin
    .from("account_deletion_requests")
    .update({ team_notified_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("team_notified_at", null)
    .select("requested_at")
    .maybeSingle();
  // Already told, or being told by a request a moment ago.
  if (!claimed) return true;

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
    const requestedAt = formatRequestedAt(claimed.requested_at);

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
    return true;
  } catch (err) {
    // Give the claim back so the request shows up as not yet sent.
    await admin
      .from("account_deletion_requests")
      .update({ team_notified_at: null })
      .eq("user_id", userId);
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

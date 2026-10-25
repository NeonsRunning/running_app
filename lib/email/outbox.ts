import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logCritical } from "@/lib/log";
import type { Json } from "@/lib/supabase/database.types";
import { chunk } from "@/lib/supabase/paginate";
import { hasBrevoEnv, sendEmail, UnconfirmedSendError, type Email } from "./brevo";

/**
 * Sending many emails reliably: write them to `email_outbox`, then send from
 * there. See the email_outbox migration for why.
 *
 * `queueEmails` writes and then sends what it can in the time it is given —
 * usually all of it, from the same `after()` that used to send directly.
 * `/api/cron/email-outbox` calls `drainOutbox` to finish the rest and retry
 * failures.
 *
 * At most once, rather than at least once: these are notices to people, and
 * one sent twice is worse than one a person has to look into. So a send that
 * timed out waiting for Brevo — which may well have sent it — is not retried
 * but left for a person (see `UnconfirmedSendError`), and a sent email whose
 * row cannot be marked sent is retried a few times and then logged as
 * critical, since its claim running out would send it again.
 */

/** Rows read per query, and emails handed to Brevo at once. */
const BATCH = 100;
const CONCURRENCY = 5;
/** Give up after this many tries; the row keeps its `last_error`. */
export const MAX_ATTEMPTS = 8;

/** Minutes to wait before try number `attempt + 1`: 1, 2, 4 … capped at 6 hours. */
export function backoffMinutes(attempt: number): number {
  return Math.min(2 ** (attempt - 1), 360);
}

/**
 * Write these emails to the outbox and start sending them. Throws only if
 * they could not be written; once written, sending carries on for up to
 * `budgetMs`, and whatever is left or fails is the cron's.
 */
export async function queueEmails(
  emails: Email[],
  { budgetMs = 60_000 }: { budgetMs?: number } = {},
): Promise<void> {
  if (!emails.length) return;
  const admin = createAdminClient();
  for (const run of chunk(emails, 500)) {
    const { error } = await admin.from("email_outbox").insert(
      run.map((email) => ({
        payload: email as unknown as Json,
        tag: email.tags?.[0] ?? null,
      })),
    );
    if (error) throw new Error(`Queueing ${run.length} emails failed: ${error.message}`);
  }
  // Queued is enough for the caller: a failure from here on is the outbox's
  // to retry, and must not make the caller think the emails were lost.
  await drainOutbox({ budgetMs }).catch((err) => {
    console.error("Sending from the outbox failed; the cron will retry:", err);
  });
}

/**
 * Send what is due in the outbox, until it is empty or `budgetMs` has passed.
 * Safe to run from several places at once: each row is claimed before it is
 * sent.
 *
 * A claim the database refuses (an error, not a lost race) stops the run
 * where it is: the rows it read stay due, and the next query would read the
 * very same rows straight back, so carrying on would only spin. The cron
 * picks them up next time.
 */
export async function drainOutbox({
  budgetMs,
}: {
  budgetMs: number;
}): Promise<{ sent: number; failed: number; unconfirmed: number; finished: boolean }> {
  const result = { sent: 0, failed: 0, unconfirmed: 0, finished: true };
  if (!hasBrevoEnv()) return { ...result, finished: false };

  const admin = createAdminClient();
  const started = Date.now();
  const outOfTime = () => Date.now() - started > budgetMs;

  for (;;) {
    if (outOfTime()) return { ...result, finished: false };

    const { data: due, error } = await admin
      .from("email_outbox")
      .select("id, payload, attempts")
      .is("sent_at", null)
      .lte("next_attempt_at", new Date().toISOString())
      .lt("attempts", MAX_ATTEMPTS)
      .order("next_attempt_at")
      .limit(BATCH);
    if (error) throw new Error(error.message);
    if (!due?.length) return result;

    let next = 0;
    let stalled: unknown = null;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, due.length) }, async () => {
        while (next < due.length && !outOfTime() && !stalled) {
          const row = due[next++];
          try {
            const outcome = await sendOne(row);
            if (outcome) result[outcome]++;
          } catch (err) {
            stalled = err;
          }
        }
      }),
    );
    if (stalled) {
      console.error("The outbox could not claim an email; stopping until the next run:", stalled);
      return { ...result, finished: false };
    }
    // Every row this round was claimed (or someone else's): the next query
    // only sees what is still due, so the loop always moves on.
  }
}

/**
 * Claim one row and send it. Null when another sender claimed it first.
 * Throws when the claim itself fails, which stops the drain.
 */
async function sendOne(row: {
  id: string;
  payload: unknown;
  attempts: number;
}): Promise<"sent" | "failed" | "unconfirmed" | null> {
  const admin = createAdminClient();
  const attempt = row.attempts + 1;

  // The claim: bump `attempts` from the value read, and push the row out of
  // reach while this send is in flight.
  const { data: claimed, error: claimError } = await admin
    .from("email_outbox")
    .update({
      attempts: attempt,
      next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Claiming email ${row.id} failed: ${claimError.message}`);
  if (!claimed) return null;

  try {
    await sendEmail(row.payload as Email);
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);

    if (err instanceof UnconfirmedSendError) {
      // Not retried: out of tries at once, so it sits with the rows that gave
      // up, its `last_error` saying why. Check Brevo's logs before resending.
      await admin
        .from("email_outbox")
        .update({ attempts: MAX_ATTEMPTS, last_error: message })
        .eq("id", row.id);
      logCritical("EMAIL_UNCONFIRMED", "Brevo did not answer in time; the email may or may not have gone, and will not be retried.", {
        outbox: row.id,
        attempts: attempt,
      });
      return "unconfirmed";
    }

    const retryAt = new Date(Date.now() + backoffMinutes(attempt) * 60_000);
    // If this write fails too, the claim still runs out in 15 minutes and
    // the row is tried again then.
    await admin
      .from("email_outbox")
      .update({ last_error: message, next_attempt_at: retryAt.toISOString() })
      .eq("id", row.id);
    if (attempt >= MAX_ATTEMPTS) {
      logCritical("EMAIL_GAVE_UP", "An email used up its retries and will not be sent.", {
        outbox: row.id,
        attempts: attempt,
        error: message,
      });
    } else {
      console.error(`Email ${row.id} failed (try ${attempt}), retrying at ${retryAt.toISOString()}:`, message);
    }
    return "failed";
  }

  await markSent(row.id);
  return "sent";
}

/** Tries at writing `sent_at`, and the pause before each retry. */
export const MARK_SENT_TRIES = 3;
const MARK_SENT_PAUSE_MS = 500;

/**
 * Record that Brevo took the email. Retried, as a row left unmarked is sent
 * again once its claim runs out; if every try fails that is logged as
 * critical, with the id to mark by hand.
 */
async function markSent(id: string): Promise<void> {
  const admin = createAdminClient();
  for (let tryNo = 1; ; tryNo++) {
    const { error } = await admin
      .from("email_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", id);
    if (!error) return;
    if (tryNo >= MARK_SENT_TRIES) {
      logCritical("EMAIL_NOT_MARKED_SENT", "An email was sent but could not be marked sent; it will go again when its claim runs out unless marked by hand.", {
        outbox: id,
        error: error.message,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, MARK_SENT_PAUSE_MS * tryNo));
  }
}

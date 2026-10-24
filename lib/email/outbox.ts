import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { chunk } from "@/lib/supabase/paginate";
import { hasBrevoEnv, sendEmail, type Email } from "./brevo";

/**
 * Sending many emails reliably: write them to `email_outbox`, then send from
 * there. See the email_outbox migration for why.
 *
 * `queueEmails` writes and then sends what it can in the time it is given —
 * usually all of it, from the same `after()` that used to send directly.
 * `/api/cron/email-outbox` calls `drainOutbox` to finish the rest and retry
 * failures.
 */

/** Rows read per query, and emails handed to Brevo at once. */
const BATCH = 100;
const CONCURRENCY = 5;
/** Give up after this many tries; the row keeps its `last_error`. */
export const MAX_ATTEMPTS = 8;

/** Minutes to wait before try number `attempt + 1`: 1, 2, 4 … capped at 6 hours. */
function backoffMinutes(attempt: number): number {
  return Math.min(2 ** (attempt - 1), 360);
}

/**
 * Write these emails to the outbox and start sending them. Resolves once they
 * are safely written; sending carries on for up to `budgetMs`, and whatever is
 * left is the cron's.
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
  await drainOutbox({ budgetMs });
}

/**
 * Send what is due in the outbox, until it is empty or `budgetMs` has passed.
 * Safe to run from several places at once: each row is claimed before it is
 * sent.
 */
export async function drainOutbox({
  budgetMs,
}: {
  budgetMs: number;
}): Promise<{ sent: number; failed: number; finished: boolean }> {
  const result = { sent: 0, failed: 0, finished: true };
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
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, due.length) }, async () => {
        while (next < due.length && !outOfTime()) {
          const row = due[next++];
          const outcome = await sendOne(row);
          if (outcome) result[outcome]++;
        }
      }),
    );
    // Every row this round was claimed (or someone else's): the next query
    // only sees what is still due, so the loop always moves on.
  }
}

/** Claim one row and send it. Null when another sender claimed it first. */
async function sendOne(row: {
  id: string;
  payload: unknown;
  attempts: number;
}): Promise<"sent" | "failed" | null> {
  const admin = createAdminClient();
  const attempt = row.attempts + 1;

  // The claim: bump `attempts` from the value read, and push the row out of
  // reach while this send is in flight.
  const { data: claimed } = await admin
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
  if (!claimed) return null;

  try {
    await sendEmail(row.payload as Email);
    await admin
      .from("email_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return "sent";
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const retryAt = new Date(Date.now() + backoffMinutes(attempt) * 60_000);
    await admin
      .from("email_outbox")
      .update({ last_error: message, next_attempt_at: retryAt.toISOString() })
      .eq("id", row.id);
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`EMAIL GAVE UP after ${attempt} tries: outbox ${row.id}:`, message);
    } else {
      console.error(`Email ${row.id} failed (try ${attempt}), retrying at ${retryAt.toISOString()}:`, message);
    }
    return "failed";
  }
}

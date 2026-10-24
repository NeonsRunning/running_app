"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/auth/session";
import { scheduleEventCancelledEmails } from "@/lib/email/event-cancelled";
import { scheduleEventRemovedEmail } from "@/lib/email/event-removed";
import { scheduleEventRestoredEmails } from "@/lib/email/event-restored";
import { createClient } from "@/lib/supabase/server";

/**
 * Removing an event, and bringing one back: platform admins only. The
 * database functions decide — `admin_remove_event()` checks the role again
 * and refuses while a payment waits for review; the check here is for the
 * message. Errors come back as keys under `adminEvents.errors`.
 */

type ModerationError =
  | "notAllowed"
  | "eventNotFound"
  | "alreadyRemoved"
  | "reasonRequired"
  | "paymentsUnderReview"
  | "saveFailed";

export type ModerationResult = { ok: true } | { ok: false; error: ModerationError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mirrors the check on `event_moderation_log.reason`. */
const MAX_REASON_LENGTH = 500;

/** What `admin_remove_event()` raises, passed through as is. */
const REMOVE_ERRORS = new Set<string>([
  "notAllowed",
  "eventNotFound",
  "alreadyRemoved",
  "reasonRequired",
  "paymentsUnderReview",
]);

/**
 * Hide an event from the listing, search and its page. Its registrations
 * and accepted results stay; its organizer is told why by email. Taking
 * down a race not yet run cancels it: its paid runners are emailed, and
 * their refunds are manual.
 */
export async function removeEventAction(
  id: string,
  reason: string,
): Promise<ModerationResult> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, error: "eventNotFound" };
  }
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (!trimmed || trimmed.length > MAX_REASON_LENGTH) {
    return { ok: false, error: "reasonRequired" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_remove_event", {
    p_event_id: id,
    p_reason: trimmed,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (REMOVE_ERRORS.has(key)) {
      return { ok: false, error: key as ModerationError };
    }
    console.error(`Removing event ${id} failed:`, error?.message);
    return { ok: false, error: "saveFailed" };
  }

  await scheduleEventRemovedEmail(data, trimmed);
  await scheduleEventCancelledEmails(data);
  // The listing, search, stats and runners' profiles all change.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Publish a removed event again, as it was. Its organizer is emailed, and so
 * are its runners when the race is still to come.
 */
export async function restoreEventAction(id: string): Promise<ModerationResult> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, error: "eventNotFound" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_restore_event", {
    p_event_id: id,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (key === "notAllowed" || key === "eventNotFound") {
      return { ok: false, error: key };
    }
    console.error(`Restoring event ${id} failed:`, error?.message);
    return { ok: false, error: "saveFailed" };
  }

  await scheduleEventRestoredEmails(data);
  revalidatePath("/", "layout");
  return { ok: true };
}

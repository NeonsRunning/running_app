"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Checking a runner in at the race-day tent, or undoing it. The event's
 * organizer, or a platform admin, may; `set_checked_in()` decides.
 */

/** A key under `checkin.errors`. */
type CheckInError = "notAllowed" | "registrationMissing" | "noCheckIn" | "checkInFailed";

export type CheckInResult =
  | { ok: true; checkedInAt: string | null }
  | { ok: false; error: CheckInError };

const KNOWN = new Set<string>(["notAllowed", "registrationMissing", "noCheckIn"]);

export async function setCheckedInAction(
  registrationId: string,
  checkedIn: boolean,
): Promise<CheckInResult> {
  if (typeof registrationId !== "string" || typeof checkedIn !== "boolean") {
    return { ok: false, error: "checkInFailed" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_checked_in", {
    p_registration_id: registrationId,
    p_checked_in: checkedIn,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? (error.message ?? "") : "";
    if (KNOWN.has(key)) return { ok: false, error: key as CheckInError };
    console.error(`Checking in ${registrationId} failed:`, error?.message);
    return { ok: false, error: "checkInFailed" };
  }

  return { ok: true, checkedInAt: data.checked_in_at };
}

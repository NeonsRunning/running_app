"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Taking a runner off an event's list. The event's organizer — or a platform
 * admin — removes a completed sign-up; whether the caller may is decided by
 * `remove_registration()`. No money moves: refunds stay a manual step in
 * Stripe or the ATH Móvil Business app.
 */

export type RemoveRegistrationResult =
  | { ok: true }
  /** A key under `eventRegistrations.errors`. */
  | { ok: false; error: "notAllowed" | "alreadyRemoved" | "removeFailed" };

export async function removeRegistrationAction(
  registrationId: string,
): Promise<RemoveRegistrationResult> {
  if (typeof registrationId !== "string") {
    return { ok: false, error: "removeFailed" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_registration", {
    p_registration_id: registrationId,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (key === "notAllowed") return { ok: false, error: "notAllowed" };
    // Removed a moment ago, from another tab or by an admin.
    if (key === "registrationMissing") return { ok: false, error: "alreadyRemoved" };
    console.error(`Removing ${registrationId} failed:`, error?.message);
    return { ok: false, error: "removeFailed" };
  }

  // Spots left, sign-up counts and the runner's own pages all change.
  revalidatePath("/", "layout");
  return { ok: true };
}

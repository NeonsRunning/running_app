"use server";

import { revalidatePath } from "next/cache";
import { scheduleMedalShippedEmail } from "@/lib/email/medal-shipped";
import { createClient } from "@/lib/supabase/server";
import { MAX_TRACKING_LENGTH } from "./vocabulary";

/**
 * Handing over a finisher's medal, from the event's registration list: by
 * mail — marked shipped, which emails the runner the first time and only
 * updates the tracking number after — or in person, marked picked up, which
 * sends nothing. The event's organizer, or a platform admin, may;
 * `mark_medal_shipped()` and `mark_medal_picked_up()` decide, including
 * whether the runner has earned it and which way they chose.
 */

/** A key under `eventRegistrations.shipErrors`. */
type MedalError =
  | "notAllowed"
  | "registrationMissing"
  | "medalsOff"
  | "pickupChosen"
  | "mailChosen"
  | "pickedUp"
  | "shipped"
  | "notFinished"
  | "addressMissing"
  | "trackingTooLong"
  | "shipFailed";

export type ShipMedalResult =
  | { ok: true; shippedAt: string; tracking: string | null }
  | { ok: false; error: MedalError };

export type PickUpMedalResult =
  | { ok: true; pickedUpAt: string }
  | { ok: false; error: MedalError };

const KNOWN = new Set<string>([
  "notAllowed",
  "registrationMissing",
  "medalsOff",
  "pickupChosen",
  "mailChosen",
  "pickedUp",
  "shipped",
  "notFinished",
  "addressMissing",
  "trackingTooLong",
]);

function failure(
  error: { code?: string; message?: string } | null,
  what: string,
): { ok: false; error: MedalError } {
  const key = error?.code === "P0001" ? (error.message ?? "") : "";
  if (KNOWN.has(key)) return { ok: false, error: key as MedalError };
  console.error(`${what} failed:`, error?.message);
  return { ok: false, error: "shipFailed" };
}

export async function markMedalShippedAction(
  registrationId: string,
  tracking: string,
): Promise<ShipMedalResult> {
  if (typeof registrationId !== "string") return { ok: false, error: "shipFailed" };
  const trimmed = typeof tracking === "string" ? tracking.trim() : "";
  if (trimmed.length > MAX_TRACKING_LENGTH) return { ok: false, error: "trackingTooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_medal_shipped", {
    p_registration_id: registrationId,
    p_tracking: trimmed || null,
  });

  if (error || !data?.medal_shipped_at) {
    return failure(error, `Marking the medal for ${registrationId} shipped`);
  }

  await scheduleMedalShippedEmail(data);
  revalidatePath("/", "layout");
  return { ok: true, shippedAt: data.medal_shipped_at, tracking: data.medal_tracking };
}

export async function markMedalPickedUpAction(
  registrationId: string,
): Promise<PickUpMedalResult> {
  if (typeof registrationId !== "string") return { ok: false, error: "shipFailed" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_medal_picked_up", {
    p_registration_id: registrationId,
  });

  if (error || !data?.medal_picked_up_at) {
    return failure(error, `Marking the medal for ${registrationId} picked up`);
  }

  revalidatePath("/", "layout");
  return { ok: true, pickedUpAt: data.medal_picked_up_at };
}

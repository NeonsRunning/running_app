"use server";

import { revalidatePath } from "next/cache";
import { scheduleShipmentEmail } from "@/lib/email/shipment-shipped";
import { createClient } from "@/lib/supabase/server";
import { MAX_TRACKING_LENGTH } from "./vocabulary";

/**
 * Handing over what a runner is owed, from the event's registration list: by
 * mail — their one shipment, kit and medal together, marked shipped, which
 * emails the runner and only updates the tracking number after — or a medal in
 * person, marked picked up, which sends nothing. The event's organizer, or a
 * platform admin, may; `mark_shipment_shipped()` and `mark_medal_picked_up()`
 * decide, including whether the medal is earned and which way the runner chose.
 */

/** A key under `eventRegistrations.shipErrors`. */
type ShipmentError =
  | "notAllowed"
  | "registrationMissing"
  | "notMailed"
  | "medalsOff"
  | "mailChosen"
  | "pickedUp"
  | "shipped"
  | "notFinished"
  | "addressMissing"
  | "trackingTooLong"
  | "shipFailed";

export type ShipmentResult =
  | {
      ok: true;
      shippedAt: string;
      tracking: string | null;
      /** When the medal left; null while it is still to come. */
      medalShippedAt: string | null;
    }
  | { ok: false; error: ShipmentError };

export type PickUpMedalResult =
  | { ok: true; pickedUpAt: string }
  | { ok: false; error: ShipmentError };

const KNOWN = new Set<string>([
  "notAllowed",
  "registrationMissing",
  "notMailed",
  "medalsOff",
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
): { ok: false; error: ShipmentError } {
  const key = error?.code === "P0001" ? (error.message ?? "") : "";
  if (KNOWN.has(key)) return { ok: false, error: key as ShipmentError };
  console.error(`${what} failed:`, error?.message);
  return { ok: false, error: "shipFailed" };
}

export async function markShipmentShippedAction(
  registrationId: string,
  tracking: string,
): Promise<ShipmentResult> {
  if (typeof registrationId !== "string") return { ok: false, error: "shipFailed" };
  const trimmed = typeof tracking === "string" ? tracking.trim() : "";
  if (trimmed.length > MAX_TRACKING_LENGTH) return { ok: false, error: "trackingTooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_shipment_shipped", {
    p_registration_id: registrationId,
    p_tracking: trimmed || null,
  });

  if (error || !data?.shipped_at) {
    return failure(error, `Marking the shipment for ${registrationId} shipped`);
  }

  await scheduleShipmentEmail(data);
  revalidatePath("/", "layout");
  return {
    ok: true,
    shippedAt: data.shipped_at,
    tracking: data.shipping_tracking,
    medalShippedAt: data.medal_shipped_at,
  };
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

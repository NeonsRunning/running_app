"use server";

import { revalidatePath } from "next/cache";
import { scheduleKitShippedEmail } from "@/lib/email/kit-shipped";
import { createClient } from "@/lib/supabase/server";
import { MAX_TRACKING_LENGTH } from "./vocabulary";

/**
 * Marking a mailed kit as shipped, from the event's registration list. The
 * event's organizer — or a platform admin — may; `mark_kit_shipped()`
 * decides. The first marking emails the runner; saving it again only updates
 * the tracking number.
 */

export type ShipKitResult =
  | { ok: true; shippedAt: string; tracking: string | null }
  /** A key under `eventRegistrations.shipErrors`. */
  | {
      ok: false;
      error:
        | "notAllowed"
        | "registrationMissing"
        | "notMailed"
        | "trackingTooLong"
        | "shipFailed";
    };

const KNOWN = new Set(["notAllowed", "registrationMissing", "notMailed", "trackingTooLong"]);

export async function markKitShippedAction(
  registrationId: string,
  tracking: string,
): Promise<ShipKitResult> {
  if (typeof registrationId !== "string") return { ok: false, error: "shipFailed" };
  const trimmed = typeof tracking === "string" ? tracking.trim() : "";
  if (trimmed.length > MAX_TRACKING_LENGTH) return { ok: false, error: "trackingTooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_kit_shipped", {
    p_registration_id: registrationId,
    p_tracking: trimmed || null,
  });

  if (error || !data?.shipped_at) {
    const key = error?.code === "P0001" ? error.message : "";
    if (KNOWN.has(key)) return { ok: false, error: key as "notAllowed" };
    console.error(`Marking ${registrationId} shipped failed:`, error?.message);
    return { ok: false, error: "shipFailed" };
  }

  await scheduleKitShippedEmail(data);
  revalidatePath("/", "layout");
  return { ok: true, shippedAt: data.shipped_at, tracking: data.shipping_tracking };
}

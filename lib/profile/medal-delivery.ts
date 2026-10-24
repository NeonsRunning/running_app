"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * A runner choosing how their finisher medal reaches them — mailed, or
 * picked up in person — and correcting the address, from the Mail section
 * of their profile until it ships or is picked up. `set_medal_delivery()`
 * decides.
 */

export type MedalDeliveryResult =
  | { ok: true; byMail: boolean; address: string | null }
  /** A key under `runner.medalDeliveryErrors`. */
  | {
      ok: false;
      error:
        | "notAllowed"
        | "medalsOff"
        | "alreadyShipped"
        | "pickedUp"
        | "addressInvalid"
        | "saveFailed";
    };

const KNOWN = new Set(["notAllowed", "medalsOff", "alreadyShipped", "pickedUp", "addressInvalid"]);

export async function setMedalDeliveryAction(
  registrationId: string,
  byMail: boolean,
  address: string,
): Promise<MedalDeliveryResult> {
  if (typeof registrationId !== "string") return { ok: false, error: "saveFailed" };
  const trimmed = typeof address === "string" ? address.trim() : "";
  if ((byMail && !trimmed) || trimmed.length > 300) {
    return { ok: false, error: "addressInvalid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_medal_delivery", {
    p_registration_id: registrationId,
    p_by_mail: Boolean(byMail),
    p_address: trimmed || null,
  });

  if (error || !data) {
    const key = error?.code === "P0001" ? error.message : "";
    if (KNOWN.has(key)) return { ok: false, error: key as "notAllowed" };
    console.error(`Saving the medal delivery of ${registrationId} failed:`, error?.message);
    return { ok: false, error: "saveFailed" };
  }

  revalidatePath("/", "layout");
  return { ok: true, byMail: data.medal_by_mail, address: data.medal_mailing_address };
}

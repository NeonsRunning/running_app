"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Saving and unsaving races.
 *
 * The action takes the state the runner wants rather than "toggle", so a
 * double click or a retried request lands on the same row either way. The
 * runner is the session's, never the payload's; row-level security on
 * `saved_events` enforces the same thing whatever this file does.
 */

export type SaveEventResult =
  | { ok: true }
  | { ok: false; error: "signedOut" | "notFound" | "failed" };

export async function setEventSavedAction(
  slug: unknown,
  saved: unknown,
): Promise<SaveEventResult> {
  if (typeof slug !== "string" || typeof saved !== "boolean") {
    return { ok: false, error: "failed" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "signedOut" };

  if (!saved) {
    const { error } = await supabase
      .from("saved_events")
      .delete()
      .eq("runner_id", user.id)
      .eq("event_slug", slug);
    return error ? { ok: false, error: "failed" } : { ok: true };
  }

  // Only published races can be saved.
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return { ok: false, error: "notFound" };

  // Already saved is success, not a conflict.
  const { error } = await supabase
    .from("saved_events")
    .upsert(
      { runner_id: user.id, event_slug: slug },
      { onConflict: "runner_id,event_slug", ignoreDuplicates: true },
    );
  return error ? { ok: false, error: "failed" } : { ok: true };
}

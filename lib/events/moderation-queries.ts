import "server-only";
import { puertoRicoToday } from "@/lib/results/evidence";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AdminEventRow = {
  id: string;
  slug: string;
  name: string;
  eventDate: string | null;
  organizerName: string;
  paidRunners: number;
  acceptedResults: number;
  paymentsUnderReview: number;
  /** Its last day is behind us, on the island. */
  finished: boolean;
  /** Only for a removed event: its latest removal. */
  removedAt: string | null;
  removalReason: string | null;
};

/**
 * Published events, or removed ones, matching a name or slug — at most 50.
 * Empty for anyone but a platform admin: `admin_list_events()` checks the
 * role.
 */
export async function listAdminEvents(
  query: string,
  removed: boolean,
): Promise<AdminEventRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_events", {
    p_query: query.trim() || undefined,
    p_removed: removed,
  });
  if (error || !data) return [];

  const today = puertoRicoToday();
  return data.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    eventDate: r.event_date,
    organizerName: r.organizer_name ?? "",
    paidRunners: Number(r.paid_runners),
    acceptedResults: Number(r.accepted_results),
    paymentsUnderReview: Number(r.payments_under_review),
    // The same test `admin_remove_event()` applies.
    finished: r.last_day !== null && r.last_day < today,
    removedAt: r.removed_at,
    removalReason: r.removal_reason,
  }));
}

import { isCronRequest } from "@/lib/cron";
import { EVIDENCE_BUCKET } from "@/lib/results/evidence";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deletes finish-time evidence that no result points at: uploads never
 * submitted, and the files of results that went with a removed sign-up.
 * `orphaned_evidence()` lists them (older than a day, so an upload in flight
 * is never touched); this removes them through Storage, which is the only
 * way a file can be deleted. Called once a day by the database's pg_cron
 * with `Authorization: Bearer $CRON_SECRET`, like the other cron routes.
 *
 * A run takes at most 500 files; a backlog clears over the following days.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: names, error } = await admin.rpc("orphaned_evidence", { p_limit: 500 });
  if (error) {
    console.error("Listing orphaned evidence failed:", error.message);
    return Response.json({ removed: 0, failed: true }, { status: 500 });
  }
  if (!names?.length) {
    return Response.json({ removed: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: removed, error: removeError } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .remove(names);
  if (removeError) {
    console.error("Removing orphaned evidence failed:", removeError.message);
    return Response.json({ removed: 0, failed: true }, { status: 500 });
  }

  return Response.json(
    { removed: removed?.length ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

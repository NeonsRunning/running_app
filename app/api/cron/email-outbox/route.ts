import { isCronRequest } from "@/lib/cron";
import { drainOutbox } from "@/lib/email/outbox";

/**
 * Sends what is waiting in the email outbox: notices to a whole race that the
 * request writing them did not finish, and earlier failures due for a retry.
 * Call it every 10 minutes with `Authorization: Bearer $CRON_SECRET`, like
 * the race reminders.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  // Stops starting sends after 4 minutes, leaving room inside `maxDuration`.
  const result = await drainOutbox({ budgetMs: 240_000 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

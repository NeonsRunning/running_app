import { isCronRequest } from "@/lib/cron";
import { sendRaceReminders } from "@/lib/email/race-reminder";
import { siteOrigin } from "@/lib/site-url";

/**
 * Sends tomorrow's race reminders. Call it every hour — Vercel Cron, or any
 * scheduler that can make an HTTP request — with the header
 * `Authorization: Bearer $CRON_SECRET`. A run sends to everyone racing
 * tomorrow that it has time for; each later run that day picks up whoever is
 * left and retries failed sends, and nobody is reminded twice. Without the
 * secret set, the route refuses everyone: it is open to the internet.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const result = await sendRaceReminders(await siteOrigin());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

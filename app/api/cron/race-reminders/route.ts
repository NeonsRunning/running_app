import { sendRaceReminders } from "@/lib/email/race-reminder";
import { siteOrigin } from "@/lib/email/registration-confirmed";

/**
 * Sends tomorrow's race reminders. Call it once a day — Vercel Cron, or any
 * scheduler that can make an HTTP request — with the header
 * `Authorization: Bearer $CRON_SECRET`. Without the secret set, the route
 * refuses everyone: it is open to the internet.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const result = await sendRaceReminders(await siteOrigin());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

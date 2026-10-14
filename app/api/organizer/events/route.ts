import type { NextRequest } from "next/server";
import { getAccount, isOrganizer } from "@/lib/auth/session";
import { getOrganizerEvents } from "@/lib/events/organizer";

/**
 * The organizer dashboard's event cards after the first page, fetched as the
 * organizer scrolls. Always the caller's own events: the organizer is the
 * session's, never the query string's, and row-level security on `events`
 * agrees whatever this file does.
 */
export async function GET(request: NextRequest) {
  const account = await getAccount();
  if (!account) return new Response("Sign in first.", { status: 401 });
  if (!isOrganizer(account.profile))
    return new Response("Organizers only.", { status: 403 });

  const offset = Number(request.nextUrl.searchParams.get("offset"));
  const page = await getOrganizerEvents(
    account.user.id,
    Number.isInteger(offset) && offset > 0 ? offset : 0,
  );
  return Response.json(page, { headers: { "Cache-Control": "no-store" } });
}

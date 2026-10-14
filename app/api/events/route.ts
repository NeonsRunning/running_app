import type { NextRequest } from "next/server";
import { searchEvents } from "@/lib/events/queries";
import { searchFromParams } from "@/lib/events/search";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";

/**
 * The pages of /events after the first, fetched as the runner scrolls.
 *
 * A Route Handler rather than a Server Function: this is a read, and Server
 * Functions are dispatched one at a time, so a page still loading would hold
 * up the search a runner just typed. The locale comes in the query string,
 * since this route sits outside `[lang]`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") ?? "";
  const { search, offset } = searchFromParams(params);

  const page = await searchEvents(
    search,
    offset,
    isLocale(lang) ? lang : DEFAULT_LOCALE,
  );
  return Response.json(page, {
    headers: { "Cache-Control": "no-store" },
  });
}

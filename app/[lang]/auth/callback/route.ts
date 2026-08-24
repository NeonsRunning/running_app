import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/config";
import { SELF_PROFILE_PATH, safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth landing point.
 *
 * Google sends the runner back here with a one-time `code`. Trading it for a
 * session has to happen on the server, because the PKCE verifier that pairs
 * with it was stored in an http-only cookie when the flow started.
 *
 * The route lives under `[lang]` so it is reachable at `/auth/callback` in
 * Spanish and `/en/auth/callback` in English, and the runner lands back in
 * the language they left from.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[lang]/auth/callback">,
) {
  const { lang } = await ctx.params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const params = request.nextUrl.searchParams;

  /**
   * Behind a load balancer `nextUrl.host` is the internal address, which
   * would send the runner somewhere unreachable. The forwarded host is the
   * one their browser knows.
   */
  const destination = (path: string, search?: string) => {
    const url = request.nextUrl.clone();
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) url.host = forwardedHost;
    url.pathname = localizePath(path, locale);
    url.search = search ?? "";
    return url;
  };

  // The provider reports a refusal in the query string rather than an error
  // status — a denied consent screen arrives here, not as a failed request.
  if (params.get("error")) {
    return NextResponse.redirect(destination("/login", "?error=oauth"));
  }

  const code = params.get("code");
  if (!code) return NextResponse.redirect(destination("/login", "?error=oauth"));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(destination("/login", "?error=oauth"));

  const next = safeNextPath(params.get("next")) ?? SELF_PROFILE_PATH;
  return NextResponse.redirect(destination(next));
}

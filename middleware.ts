import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePath,
  splitLocale,
} from "@/lib/i18n/config";
import { applySession, refreshSession } from "@/lib/supabase/proxy";
import {
  NEXT_PARAM,
  SELF_PROFILE_PATH,
  isGuestOnlyPath,
  isProtectedPath,
  safeNextPath,
} from "@/lib/auth/routes";

/**
 * Locale routing and session refresh.
 *
 * Every route lives under `app/[lang]`, but only English carries a prefix in
 * the URL. Spanish — the default — is served from the root, so `/events` is
 * rewritten to `/es/events` behind the scenes while the address bar keeps the
 * clean path.
 *
 * The locale is decided by the path alone: no sniffing, no negotiation. That
 * keeps every URL cacheable and means a shared link always opens in the
 * language it was written in.
 *
 * The same pass rotates Supabase's access token. It has to happen here:
 * tokens are short-lived, and server components cannot set cookies, so
 * without this every render would eventually see an expired session. The
 * refresh runs before the locale rules choose a response, and its cookies are
 * written onto whichever response wins.
 *
 * NOTE ON THE FILE NAME: Next 16 documents `middleware` as deprecated in
 * favour of a `proxy.ts` file exporting `proxy`. That convention does not
 * work in the pinned 16.3.2 Turbopack build — a root `proxy.ts` compiles but
 * is never registered (`middleware-manifest.json` comes back with an empty
 * `sortedMiddleware`), so every unprefixed path 404s. Verified by building
 * both spellings; only this one registers. Rename to `proxy.ts` (and rename
 * the export to `proxy`) once a Next release wires that convention up.
 */
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";

  // `/es/events` and `/events` would otherwise render the same page at two
  // URLs. The unprefixed form is canonical, so send the other one there. No
  // session work: nothing renders on a redirect.
  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = splitLocale(pathname).path;
    return NextResponse.redirect(url, 308);
  }

  const session = await refreshSession(request);
  const { locale, path } = splitLocale(pathname);

  // Turning anonymous traffic away here is an optimisation, not the
  // guarantee — pages that read account data call `requireUser()` as well.
  // The path the runner wanted rides along so login can finish the journey.
  if (isProtectedPath(path) && !session.user) {
    const url = request.nextUrl.clone();
    url.pathname = localizePath("/login", locale);
    url.search = "";
    url.searchParams.set(NEXT_PARAM, path);
    return applySession(NextResponse.redirect(url), session);
  }

  // A signed-in runner has no use for the login or sign-up screens. If one of
  // those URLs still carries a destination — a stale tab, a bookmarked link —
  // honour it rather than dropping them on their profile.
  if (isGuestOnlyPath(path) && session.user) {
    const wanted = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM));
    const url = request.nextUrl.clone();
    url.pathname = localizePath(wanted ?? SELF_PROFILE_PATH, locale);
    url.search = "";
    return applySession(NextResponse.redirect(url), session);
  }

  // `refreshSession` writes rotated tokens back into the request's cookie
  // jar, and `RequestCookies` keeps the `cookie` header in step — so passing
  // the headers through hands the fresh session to the render.
  const init = { request: { headers: request.headers } };

  // Non-default locales already match `app/[lang]` as written.
  if (isLocale(first)) return applySession(NextResponse.next(init), session);

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return applySession(NextResponse.rewrite(url, init), session);
}

export const config = {
  /**
   * Skip Next internals and anything in `public/`. Without the file-extension
   * escape hatch the rewrite would swallow images and the web manifest.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

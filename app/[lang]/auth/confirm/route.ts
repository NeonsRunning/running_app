import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import {
  CONFIRM_LINK_PATH,
  NEXT_PARAM,
  SELF_PROFILE_PATH,
  appUrl,
  isEmailLinkType,
  safeNextPath,
} from "@/lib/auth/routes";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Email link landing point.
 *
 * Confirmation and password-reset emails are spent for a session, so the
 * runner arrives signed in — a recovery link lands on `/reset-password` with
 * the rights to change the password, and a sign-up link lands on the
 * runner's own profile.
 *
 * TWO LINK SHAPES ARRIVE HERE, because what Supabase sends depends on how the
 * project's email templates are written:
 *
 * - `?token_hash=…&type=…` — what a template using `{{ .TokenHash }}` builds.
 *   Preferred: the hash is verified straight against Supabase, so the link
 *   works in a different browser from the one that asked for it. A runner who
 *   requests a reset on their laptop and opens the mail on their phone still
 *   gets in.
 *
 *   That same property makes it a login-CSRF tool if it is spent on sight:
 *   anyone can request a link for their own account and send it to someone
 *   else, whose browser would then be quietly signed in to the sender's
 *   account — and whatever the victim saves (their details, a card) lands
 *   there. So a GET does not spend it. It forwards to `CONFIRM_LINK_PATH`,
 *   which says what the link will do (and who is signed in now, if anyone)
 *   and spends it only when the runner presses Continue, through a server
 *   action — a same-origin POST a third-party page cannot forge. Mail
 *   scanners that open every link no longer burn it either.
 *
 * - `?code=…` — what the stock `{{ .ConfirmationURL }}` template produces,
 *   since `@supabase/ssr` pins the client to the PKCE flow. Supabase's own
 *   verify endpoint spends the token and bounces here with the code. It has
 *   to be traded for a session against the PKCE verifier cookie, so this
 *   shape only works in the browser that started the flow — which is also
 *   why it is safe to trade straight away: another person's code is useless
 *   without the verifier cookie their own browser holds.
 *
 * Handling both means recovery works on a fresh project with untouched
 * templates, and improves — rather than breaks — once they are customised.
 *
 * Single use either way: refreshing a spent URL fails, which is why every
 * branch ends in a redirect rather than rendering.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[lang]/auth/confirm">,
) {
  const { lang } = await ctx.params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const params = request.nextUrl.searchParams;

  // The configured origin, never `x-forwarded-host`: see the callback route.
  const origin = await siteOrigin();
  const destination = (path: string) => appUrl(origin, path, locale);

  // Expired and already-used links come back from Supabase's verify endpoint
  // as a redirect carrying an error, not as a failed request.
  const failed = destination("/login?error=link");
  if (params.get("error") || params.get("error_code")) {
    return NextResponse.redirect(failed);
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");
  const next = safeNextPath(params.get(NEXT_PARAM));

  if (tokenHash && isEmailLinkType(type)) {
    const confirm = destination(CONFIRM_LINK_PATH);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", type);
    if (next) confirm.searchParams.set(NEXT_PARAM, next);
    return NextResponse.redirect(confirm);
  }

  if (!code) return NextResponse.redirect(failed);

  // No `type` rides along on this shape, so the destination has to come from
  // the `next` parameter the outgoing link carried.
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(failed);

  return NextResponse.redirect(destination(next ?? SELF_PROFILE_PATH));
}

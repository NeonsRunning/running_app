import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/config";
import { SELF_PROFILE_PATH, safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/** The link types the app sends: address confirmation and password recovery. */
const TYPES = new Set<EmailOtpType>(["signup", "email", "email_change", "recovery"]);

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && TYPES.has(value as EmailOtpType);
}

/**
 * Email link landing point.
 *
 * Confirmation and password-reset emails are spent here for a session, so the
 * runner arrives already signed in — a recovery link lands on
 * `/reset-password` with the rights to change the password, and a sign-up
 * link lands on the runner's own profile.
 *
 * TWO LINK SHAPES ARRIVE HERE, because what Supabase sends depends on how the
 * project's email templates are written:
 *
 * - `?token_hash=…&type=…` — what a template using `{{ .TokenHash }}` builds.
 *   Preferred: the hash is verified straight against Supabase, so the link
 *   works in a different browser from the one that asked for it. A runner who
 *   requests a reset on their laptop and opens the mail on their phone still
 *   gets in.
 * - `?code=…` — what the stock `{{ .ConfirmationURL }}` template produces,
 *   since `@supabase/ssr` pins the client to the PKCE flow. Supabase's own
 *   verify endpoint spends the token and bounces here with the code. It has
 *   to be traded for a session against the PKCE verifier cookie, so this
 *   shape only works in the browser that started the flow.
 *
 * Handling both means recovery works on a fresh project with untouched
 * templates, and improves — rather than breaks — once they are customised.
 *
 * Single use either way: refreshing this URL after the token is spent fails,
 * which is why every branch ends in a redirect rather than rendering.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[lang]/auth/confirm">,
) {
  const { lang } = await ctx.params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const params = request.nextUrl.searchParams;

  const destination = (path: string, search?: string) => {
    const url = request.nextUrl.clone();
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) url.host = forwardedHost;
    url.pathname = localizePath(path, locale);
    url.search = search ?? "";
    return url;
  };

  // Expired and already-used links come back from Supabase's verify endpoint
  // as a redirect carrying an error, not as a failed request.
  const failed = destination("/login", "?error=link");
  if (params.get("error") || params.get("error_code")) {
    return NextResponse.redirect(failed);
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");

  const supabase = await createClient();

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return NextResponse.redirect(failed);
  } else if (code) {
    // No `type` rides along on this shape, so the destination has to come
    // from the `next` parameter the outgoing link carried.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(failed);
  } else {
    return NextResponse.redirect(failed);
  }

  const fallback = type === "recovery" ? "/reset-password" : SELF_PROFILE_PATH;
  const next = safeNextPath(params.get("next")) ?? fallback;
  return NextResponse.redirect(destination(next));
}

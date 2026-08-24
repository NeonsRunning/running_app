import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { hasSupabaseEnv, supabaseEnv } from "./env";

type PendingCookie = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export type SessionRefresh = {
  user: User | null;
  /** Cookies the refresh produced, to be written onto whatever response wins. */
  cookies: PendingCookie[];
  /** Cache headers Supabase requires alongside a rotated token. */
  headers: Record<string, string>;
};

const EMPTY: SessionRefresh = { user: null, cookies: [], headers: {} };

/**
 * Refresh the session for an incoming request and report who is signed in.
 *
 * Access tokens are short-lived, so something has to trade the refresh token
 * for a new pair before the page renders — that is this. It runs in the proxy
 * because server components cannot set cookies.
 *
 * The refreshed cookies are *collected* rather than written, because the
 * locale rules decide afterwards whether the response is a rewrite, a redirect
 * or a pass-through. `applySession` writes them onto whichever one wins. The
 * request's own cookie jar is updated inline so a response built with
 * `{ request: { headers } }` carries the new tokens downstream.
 */
export async function refreshSession(
  request: NextRequest,
): Promise<SessionRefresh> {
  // No project configured: the app runs signed out rather than crashing.
  if (!hasSupabaseEnv()) return EMPTY;

  const { url, anonKey } = supabaseEnv();
  const pending: PendingCookie[] = [];
  const headers: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, responseHeaders) => {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          pending.push({ name, value, options: options as PendingCookie["options"] });
        }
        Object.assign(headers, responseHeaders);
      },
    },
  });

  // `getUser` revalidates the token against Supabase; `getSession` only reads
  // the cookie, which a client can forge. Never gate on `getSession` here.
  const { data, error } = await supabase.auth.getUser();

  return {
    user: error ? null : data.user,
    cookies: pending,
    headers,
  };
}

/** Write a refresh's cookies and headers onto the outgoing response. */
export function applySession<T extends NextResponse>(
  response: T,
  refresh: SessionRefresh,
): T {
  for (const { name, value, options } of refresh.cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(refresh.headers)) {
    response.headers.set(name, value);
  }
  return response;
}

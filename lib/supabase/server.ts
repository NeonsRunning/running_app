import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * A new client per request, never a module-level singleton: the client carries
 * the caller's session, so sharing one across requests would hand one runner's
 * session to the next.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies — only server actions and
          // route handlers can. That is fine: the proxy has already refreshed
          // this request's session and written the cookies onto the response.
        }
      },
    },
  });
}

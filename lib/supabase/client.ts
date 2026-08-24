"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/**
 * Supabase client for client components.
 *
 * `createBrowserClient` is a singleton, so calling this on every render is
 * cheap and every caller shares one auth state listener.
 */
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase with the service role: bypasses row-level security.
 *
 * Only for writes no runner may make for themselves — recording the Stripe
 * PaymentIntent opened for a registration, and confirming it once Stripe says
 * it was paid, including from the webhook, which has no session at all.
 * Never hand its results to the client unfiltered.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Payments need it to confirm " +
        "registrations; find it under Project Settings > API.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

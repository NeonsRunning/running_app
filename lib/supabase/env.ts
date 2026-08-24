/**
 * Supabase project credentials.
 *
 * Both values are public by design — the anon key only ever grants what the
 * project's row-level security policies allow — so they ride along in the
 * client bundle under the `NEXT_PUBLIC_` prefix. Read them through the two
 * helpers below rather than `process.env` directly: Turbopack inlines
 * `process.env.NEXT_PUBLIC_*` at the point of access, so keeping the accesses
 * in one module keeps the substitution predictable.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether the project is configured. The proxy checks this so the app still
 * boots — signed out, with auth routes inert — on a machine that has no
 * Supabase project yet.
 */
export function hasSupabaseEnv(): boolean {
  return Boolean(url && anonKey);
}

export function supabaseEnv(): { url: string; anonKey: string } {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url, anonKey };
}

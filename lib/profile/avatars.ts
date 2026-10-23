import { hasSupabaseEnv, supabaseEnv } from "@/lib/supabase/env";

/**
 * Profile photos.
 *
 * The same route as event covers (`lib/events/images.ts`): the browser
 * converts the photo to a square WebP, uploads it straight to the public
 * `avatars` bucket into a folder named for the runner's id, and hands only
 * the object path to the server action. Shared by client and server, so
 * nothing here may import server code.
 */

export const AVATAR_BUCKET = "avatars";

/** Mirrors the bucket's `file_size_limit`, which applies after conversion. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Side of the stored square. The profile header shows it at 176 px. */
export const AVATAR_EDGE = 512;

/** Public URL of a stored photo, or null without one. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path || !hasSupabaseEnv()) return null;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

import { hasSupabaseEnv, supabaseEnv } from "@/lib/supabase/env";

/**
 * Event cover images.
 *
 * The wizard converts the photo to WebP (`convert-image.ts`), uploads it
 * straight to the public `event-images` bucket from the browser — keeping
 * the file out of the server action's request body — and posts only the
 * object path. Storage policies keep each organizer to a
 * folder named for their user id; the save action checks the same shape.
 * Shared by client and server, so nothing here may import server code.
 */

export const EVENT_IMAGE_BUCKET = "event-images";

/** Mirrors the bucket's `file_size_limit`, which applies after conversion. */
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Every stored image is WebP; the bucket accepts nothing else. */
export const EVENT_IMAGE_TYPE = "image/webp";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/${UUID}\\.webp$`, "i");

/** Whether `path` is an image object inside `ownerId`'s folder. */
export function isOwnImagePath(path: string, ownerId: string): boolean {
  const match = PATH.exec(path);
  return Boolean(match && match[1].toLowerCase() === ownerId.toLowerCase());
}

/** Public URL of a stored image, or undefined without one. */
export function eventImageUrl(path: string | null | undefined): string | undefined {
  if (!path || !hasSupabaseEnv()) return undefined;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/${path}`;
}

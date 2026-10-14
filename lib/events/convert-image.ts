/**
 * Turn whatever photo an organizer picks into a WebP cover, in the browser.
 *
 * Phones are the main source, so iPhone HEIC/HEIF is a first-class input.
 * Each step uses the browser's own codec when it has one and loads a
 * WebAssembly codec only when it does not:
 *
 * - Decode: `createImageBitmap` reads JPEG, PNG, WebP, GIF and AVIF
 *   everywhere, and HEIC in Safari. Elsewhere (Chrome, Firefox, Windows)
 *   HEIC goes through libheif via `heic-to`.
 * - Encode: the canvas writes WebP in Chromium and Firefox. Safari quietly
 *   hands back PNG instead, so there libwebp via `@jsquash/webp` takes over.
 *
 * Redrawing through a canvas also applies the EXIF orientation and drops the
 * metadata, so a phone's GPS position never reaches a public listing.
 * Browser-only: it needs `createImageBitmap` and a canvas.
 */

/** Longest edge of the stored image. Covers render far smaller than this. */
const MAX_EDGE = 1920;
const QUALITY = 0.82;

/** Largest file accepted before conversion: a 48 MP iPhone photo fits. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Keys under `publish.errors`. */
export type ConversionError = "imageType" | "imageTooLarge" | "imageUnreadable";

export class ImageConversionError extends Error {
  constructor(public readonly code: ConversionError) {
    super(code);
  }
}

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

/** ISO-BMFF brands an iPhone or other HEIF camera writes. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * Whether a file is HEIC/HEIF. Checks the bytes as well as the name and type:
 * some browsers report an empty type for .heic, and a renamed file lies.
 */
async function isHeic(file: File): Promise<boolean> {
  if (HEIC_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...head);
  return text.slice(4, 8) === "ftyp" && HEIC_BRANDS.has(text.slice(8, 12));
}

async function decode(file: File): Promise<ImageBitmap> {
  const heic = await isHeic(file);
  if (!heic && file.type && !file.type.startsWith("image/")) {
    throw new ImageConversionError("imageType");
  }

  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!heic) throw new ImageConversionError("imageUnreadable");
  }

  try {
    const { heicTo } = await import("heic-to/next");
    return await heicTo({ blob: file, type: "bitmap" });
  } catch {
    throw new ImageConversionError("imageUnreadable");
  }
}

/** A 2D canvas of the given size; offscreen where the browser has one. */
function canvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(width, height);
    return {
      ctx: c.getContext("2d"),
      toBlob: (type: string, quality: number) => c.convertToBlob({ type, quality }),
    };
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return {
    ctx: c.getContext("2d"),
    toBlob: (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => c.toBlob(resolve, type, quality)),
  };
}

/** Convert an image file to a resized WebP blob. */
export async function toWebp(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageConversionError("imageTooLarge");

  const bitmap = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const { ctx, toBlob } = canvas(width, height);
    if (!ctx) throw new ImageConversionError("imageUnreadable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const native = await toBlob("image/webp", QUALITY).catch(() => null);
    if (native?.type === "image/webp") return native;

    // No native WebP encoder (Safari): fall back to libwebp.
    const { default: encode } = await import("@jsquash/webp/encode");
    const pixels = ctx.getImageData(0, 0, width, height);
    const buffer = await encode(pixels, { quality: QUALITY * 100 });
    return new Blob([buffer], { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

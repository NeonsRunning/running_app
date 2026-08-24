/** Join conditional class names. Tiny local helper so the UI layer stays dependency-free. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

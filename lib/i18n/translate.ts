import { DEFAULT_LOCALE, localizePath, type Locale } from "./config";
import type { Dictionary } from "./types";

export type Translate = {
  (key: string, vars?: Record<string, string | number>): string;
  /** For keys holding an array of strings — lists, paragraphs, bullet copy. */
  list: (key: string) => string[];
  /** Whether a key resolves, for callers that supply their own fallback. */
  has: (key: string) => boolean;
  /**
   * For keys holding structured copy — an array of objects, such as FAQ
   * entries or policy sections. Returns an empty array when the key is
   * missing, so a gap renders as nothing rather than throwing.
   */
  items: <T>(key: string) => T[];
  /** Prefix an app path with the active locale. */
  path: (path: string) => string;
  locale: Locale;
};

/**
 * Resolve a dotted key against the dictionary. Missing keys return the key
 * itself so a gap shows up in the UI as an obvious breadcrumb rather than an
 * empty space or a crash.
 */
function resolve(dict: Dictionary, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Replace `{name}` placeholders with the supplied values. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Build a translator bound to one dictionary. Shared by the `useT` hook on the
 * client and `getT()` on the server so both resolve keys identically.
 */
export function createTranslator(
  dict: Dictionary,
  locale: Locale = DEFAULT_LOCALE,
): Translate {
  const t = ((key, vars) => {
    const value = resolve(dict, key);
    if (typeof value !== "string") {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] missing string for "${key}" (${locale})`);
      }
      return key;
    }
    return interpolate(value, vars);
  }) as Translate;

  t.has = (key) => typeof resolve(dict, key) === "string";

  t.items = <T,>(key: string): T[] => {
    const value = resolve(dict, key);
    return Array.isArray(value) ? (value as T[]) : [];
  };

  t.list = (key) => {
    const value = resolve(dict, key);
    return Array.isArray(value) ? (value as string[]) : [];
  };
  t.path = (path) => localizePath(path, locale);
  t.locale = locale;

  return t;
}

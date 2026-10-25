import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dictionary } from "./types";
import { createTranslator } from "./translate";

const dict = {
  greeting: "Hello, {name}!",
  nested: { deep: { key: "Deep" }, list: ["one", "two"] },
  faq: [{ q: "Why?", a: "Because." }],
  count: "{count} left of {count}",
} as unknown as Dictionary;

afterEach(() => vi.restoreAllMocks());

describe("createTranslator", () => {
  const t = createTranslator(dict, "en");

  it("resolves dotted keys and fills placeholders", () => {
    expect(t("nested.deep.key")).toBe("Deep");
    expect(t("greeting", { name: "Ana" })).toBe("Hello, Ana!");
    expect(t("count", { count: 3 })).toBe("3 left of 3");
  });

  it("leaves a placeholder with no value as it is", () => {
    expect(t("greeting")).toBe("Hello, {name}!");
    expect(t("greeting", { other: "x" })).toBe("Hello, {name}!");
  });

  it("returns a missing key as itself, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t("nested.missing")).toBe("nested.missing");
    // A node that is not a string is missing too.
    expect(t("nested.deep")).toBe("nested.deep");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("warns in production as well", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t("gone")).toBe("gone");
    expect(warn).toHaveBeenCalledWith('[i18n] missing string for "gone" (en)');
    vi.unstubAllEnvs();
  });

  it("answers has, list and items without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t.has("nested.deep.key")).toBe(true);
    expect(t.has("nested.deep")).toBe(false);
    expect(t.list("nested.list")).toEqual(["one", "two"]);
    expect(t.list("greeting")).toEqual([]);
    expect(t.items<{ q: string }>("faq")[0].q).toBe("Why?");
    expect(t.items("missing")).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("localizes paths for its locale", () => {
    expect(t.locale).toBe("en");
    expect(t.path("/events")).toBe("/en/events");
    expect(createTranslator(dict, "es").path("/events")).toBe("/events");
  });
});

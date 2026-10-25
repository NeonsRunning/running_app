import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, localizePath, splitLocale } from "./config";

describe("isLocale", () => {
  it("knows the two languages and nothing else", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("EN")).toBe(false);
  });
});

describe("localizePath", () => {
  it("leaves the default locale unprefixed", () => {
    expect(DEFAULT_LOCALE).toBe("es");
    expect(localizePath("/events", "es")).toBe("/events");
    expect(localizePath("/", "es")).toBe("/");
  });

  it("prefixes English, without a trailing slash on the home page", () => {
    expect(localizePath("/events/carrera-1", "en")).toBe("/en/events/carrera-1");
    expect(localizePath("/", "en")).toBe("/en");
  });
});

describe("splitLocale", () => {
  it("reads an English prefix", () => {
    expect(splitLocale("/en/events")).toEqual({ locale: "en", path: "/events" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/en/")).toEqual({ locale: "en", path: "/" });
  });

  it("drops a trailing slash under a prefix", () => {
    expect(splitLocale("/en/events/")).toEqual({ locale: "en", path: "/events" });
  });

  it("reads an explicit default prefix too", () => {
    expect(splitLocale("/es/events")).toEqual({ locale: "es", path: "/events" });
  });

  it("gives unprefixed paths to the default locale, as they are", () => {
    expect(splitLocale("/events")).toEqual({ locale: "es", path: "/events" });
    expect(splitLocale("/")).toEqual({ locale: "es", path: "/" });
    // Only a whole segment counts as a prefix.
    expect(splitLocale("/english")).toEqual({ locale: "es", path: "/english" });
  });

  it("is the inverse of localizePath", () => {
    for (const locale of ["es", "en"] as const) {
      for (const path of ["/", "/events", "/runners/me/settings"]) {
        expect(splitLocale(localizePath(path, locale))).toEqual({ locale, path });
      }
    }
  });
});

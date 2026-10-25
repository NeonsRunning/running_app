import { describe, expect, it } from "vitest";
import { loginPath, safeNextPath } from "./routes";

describe("loginPath", () => {
  it("carries the page the visitor was on", () => {
    expect(loginPath("/events?distance=5K")).toBe(
      "/login?next=%2Fevents%3Fdistance%3D5K",
    );
  });

  it.each([[undefined], [null], [""], ["/"], ["/login"], ["/signup?x=1"], ["/forgot-password"]])(
    "sends %j to the bare login screen",
    (next) => {
      expect(loginPath(next)).toBe("/login");
    },
  );
});

describe("safeNextPath", () => {
  it.each([
    ["/events", "/events"],
    ["/events?distance=5K#list", "/events?distance=5K#list"],
    ["/runners/me", "/runners/me"],
    // Encoded slashes stay encoded: the browser does not decode them into a host.
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
    ["/%5Cevil.com", "/%5Cevil.com"],
  ])("keeps the app path %j", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "events",
    "//evil.com",
    "https://evil.com",
    // Browsers read a backslash as a slash: "/\evil.com" is "//evil.com".
    "/\\evil.com",
    // Browsers drop tabs and newlines before parsing.
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    // Dot segments collapse to "//evil.com".
    "/.//evil.com",
    "/..//evil.com",
  ])("refuses %j", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("never returns a path a browser would send off-site", () => {
    for (const value of ["/\\\\evil.com", "/ /evil.com", "/.//evil.com", "/..//evil.com"]) {
      const out = safeNextPath(value);
      if (out !== null) {
        expect(new URL(out, "https://neons.example").origin).toBe("https://neons.example");
      }
    }
  });
});

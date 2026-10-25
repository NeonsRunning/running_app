import { describe, expect, it } from "vitest";
import {
  RECOVERY_WINDOW_SECONDS,
  appUrl,
  isRecentRecovery,
  loginPath,
  safeNextPath,
} from "./routes";

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

describe("appUrl", () => {
  const origin = "https://neons.example";

  it("keeps a query string and fragment out of the pathname", () => {
    const url = appUrl(origin, "/events?distance=5K&page=2#list", "es");
    expect(url.href).toBe("https://neons.example/events?distance=5K&page=2#list");
    expect(url.pathname).toBe("/events");
  });

  it("prefixes the path, not the query, for a non-default locale", () => {
    expect(appUrl(origin, "/login?error=oauth", "en").href).toBe(
      "https://neons.example/en/login?error=oauth",
    );
    expect(appUrl(origin, "/", "en").href).toBe("https://neons.example/en");
  });

  it("stays on the origin it was given", () => {
    for (const path of ["//evil.com/x", "https://evil.com/x", "/\\evil.com"]) {
      expect(appUrl(origin, path, "es").origin).toBe(origin);
    }
  });
});

describe("isRecentRecovery", () => {
  const now = 1_800_000_000;

  it("accepts a session a recovery link opened within the window", () => {
    expect(isRecentRecovery([{ method: "recovery", timestamp: now - 60 }], now)).toBe(true);
    expect(isRecentRecovery(["recovery"], now)).toBe(true);
  });

  it("refuses an old recovery session", () => {
    const stale = now - RECOVERY_WINDOW_SECONDS - 1;
    expect(isRecentRecovery([{ method: "recovery", timestamp: stale }], now)).toBe(false);
  });

  it("refuses every other way of signing in", () => {
    expect(isRecentRecovery(undefined, now)).toBe(false);
    expect(isRecentRecovery([], now)).toBe(false);
    expect(isRecentRecovery([{ method: "password", timestamp: now }], now)).toBe(false);
    expect(isRecentRecovery([{ method: "oauth", timestamp: now }, "otp"], now)).toBe(false);
  });
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

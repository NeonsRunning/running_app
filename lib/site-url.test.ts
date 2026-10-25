import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = vi.fn<() => Headers>(() => new Headers());
vi.mock("next/headers", () => ({ headers: async () => requestHeaders() }));

/** A fresh module per test: the "already warned" flag is module state. */
async function origin(): Promise<string> {
  vi.resetModules();
  const { siteOrigin } = await import("./site-url");
  return siteOrigin();
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const name of [
    "NEXT_PUBLIC_SITE_URL",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "PORT",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("NODE_ENV", "development");
  requestHeaders.mockReturnValue(new Headers());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("siteOrigin", () => {
  it("uses NEXT_PUBLIC_SITE_URL, without a trailing slash", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://neons.run/");
    requestHeaders.mockReturnValue(new Headers({ host: "evil.com" }));
    await expect(origin()).resolves.toBe("https://neons.run");
  });

  it("falls back to the production domain on Vercel production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "neons.run");
    vi.stubEnv("VERCEL_URL", "neons-abc123.vercel.app");
    await expect(origin()).resolves.toBe("https://neons.run");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SITE_URL_MISSING"));
  });

  it("uses a preview's own deployment URL, not the request host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "neons-abc123.vercel.app");
    requestHeaders.mockReturnValue(new Headers({ "x-forwarded-host": "evil.com" }));
    await expect(origin()).resolves.toBe("https://neons-abc123.vercel.app");
  });

  it("refuses to build links from request headers in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    requestHeaders.mockReturnValue(
      new Headers({ host: "evil.com", "x-forwarded-host": "evil.com" }),
    );
    await expect(origin()).rejects.toThrow(/NEXT_PUBLIC_SITE_URL is not set/);
  });

  it("uses a localhost request host in development", async () => {
    requestHeaders.mockReturnValue(new Headers({ host: "localhost:3001" }));
    await expect(origin()).resolves.toBe("http://localhost:3001");

    requestHeaders.mockReturnValue(
      new Headers({ host: "127.0.0.1:3000", "x-forwarded-proto": "https" }),
    );
    await expect(origin()).resolves.toBe("https://127.0.0.1:3000");
  });

  it.each<Record<string, string>>([
    { host: "evil.com" },
    { host: "localhost:3000", "x-forwarded-host": "evil.com" },
    { host: "localhost.evil.com" },
    { host: "localhost:3000@evil.com" },
  ])("ignores a non-local host in development: %j", async (h) => {
    requestHeaders.mockReturnValue(new Headers(h));
    await expect(origin()).resolves.toBe("http://localhost:3000");
  });
});

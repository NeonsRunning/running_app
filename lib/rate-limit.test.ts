import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { ipFromHeaders, withinLimits, LIMITS } = await import("./rate-limit");

const CHECKS = [{ action: "auth:signin:ip", who: "203.0.113.7", limit: LIMITS.signInPerIp }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ipFromHeaders", () => {
  it("reads Vercel's header on Vercel", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
    });
    expect(ipFromHeaders(h, true)).toBe("203.0.113.7");
  });

  it("ignores Vercel's header anywhere else", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "6.6.6.6",
      "x-forwarded-for": "203.0.113.7",
    });
    expect(ipFromHeaders(h, false)).toBe("203.0.113.7");
  });

  it("prefers x-real-ip to x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6" });
    expect(ipFromHeaders(h, false)).toBe("203.0.113.7");
  });

  it("takes the proxy-appended, rightmost x-forwarded-for entry", () => {
    // The client sent "6.6.6.6"; the proxy appended the address it saw.
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1 ,203.0.113.7" });
    expect(ipFromHeaders(h, false)).toBe("203.0.113.7");
  });

  it("says unknown with nothing to go on", () => {
    expect(ipFromHeaders(new Headers(), false)).toBe("unknown");
  });
});

describe("withinLimits", () => {
  it("passes while every count is within its limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(withinLimits(CHECKS)).resolves.toBe(true);
  });

  it("refuses once a count is over", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(withinLimits(CHECKS)).resolves.toBe(false);
  });

  it("fails closed in production when the count errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    await expect(withinLimits(CHECKS)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("RATE_LIMIT_UNAVAILABLE"));
  });

  it("fails closed in production without the service role key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(withinLimits(CHECKS)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets calls through in development when it cannot count", async () => {
    vi.stubEnv("NODE_ENV", "development");
    rpc.mockRejectedValue(new Error("connection refused"));
    await expect(withinLimits(CHECKS)).resolves.toBe(true);

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(withinLimits(CHECKS)).resolves.toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isLiveKeyOutsideProduction } from "./server";

describe("isLiveKeyOutsideProduction", () => {
  it.each(["development", "test", undefined])(
    "refuses a live key when NODE_ENV is %s",
    (env) => {
      expect(isLiveKeyOutsideProduction("sk_live_abc", env)).toBe(true);
      expect(isLiveKeyOutsideProduction("rk_live_abc", env)).toBe(true);
    },
  );

  it("allows a live key in production", () => {
    expect(isLiveKeyOutsideProduction("sk_live_abc", "production")).toBe(false);
  });

  it("allows a test key, or none, anywhere", () => {
    expect(isLiveKeyOutsideProduction("sk_test_abc", "development")).toBe(false);
    expect(isLiveKeyOutsideProduction(undefined, "development")).toBe(false);
  });
});

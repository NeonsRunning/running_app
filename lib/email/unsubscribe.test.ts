import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "@/lib/i18n/translate";
import en from "@/dictionaries/en.json";
import {
  isEmailPreference,
  optionalEmailLinks,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("unsubscribe tokens", () => {
  it("verify for the same account and email only", () => {
    const token = unsubscribeToken("user-1", "reminders")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyUnsubscribeToken("user-1", "reminders", token)).toBe(true);
    expect(verifyUnsubscribeToken("user-2", "reminders", token)).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "updates", token)).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "reminders", token.slice(1))).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "reminders", "")).toBe(false);
  });

  it("change with the key", () => {
    const token = unsubscribeToken("user-1", "results")!;
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "rotated");
    expect(verifyUnsubscribeToken("user-1", "results", token)).toBe(false);
  });

  it("are not made, nor accepted, without a key", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(unsubscribeToken("user-1", "results")).toBeNull();
    expect(verifyUnsubscribeToken("user-1", "results", "anything")).toBe(false);
  });
});

describe("isEmailPreference", () => {
  it("accepts only the emails a runner can switch off", () => {
    expect(isEmailPreference("reminders")).toBe(true);
    expect(isEmailPreference("results")).toBe(true);
    expect(isEmailPreference("updates")).toBe(true);
    expect(isEmailPreference("payments")).toBe(false);
    expect(isEmailPreference(null)).toBe(false);
  });
});

describe("optionalEmailLinks", () => {
  const t = createTranslator(en, "en");

  it("links the footer to settings and the header to the one-click address", () => {
    const { manage, listUnsubscribe } = optionalEmailLinks({
      origin: "https://neons.test",
      locale: "en",
      t,
      userId: "user-1",
      preference: "updates",
    });
    expect(manage).toEqual({
      label: en.emails.common.manage,
      url: "https://neons.test/en/runners/me/settings",
    });
    expect(listUnsubscribe.oneClick).toBe(true);
    const url = new URL(listUnsubscribe.url);
    expect(url.origin + url.pathname).toBe("https://neons.test/api/email/unsubscribe");
    expect(url.searchParams.get("u")).toBe("user-1");
    expect(url.searchParams.get("p")).toBe("updates");
    expect(url.searchParams.get("l")).toBe("en");
    expect(verifyUnsubscribeToken("user-1", "updates", url.searchParams.get("t")!)).toBe(true);
  });

  it("falls back to the settings page when nothing can sign", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { listUnsubscribe } = optionalEmailLinks({
      origin: "https://neons.test",
      locale: "es",
      t,
      userId: "user-1",
      preference: "reminders",
    });
    expect(listUnsubscribe).toEqual({
      url: "https://neons.test/runners/me/settings",
      oneClick: false,
    });
  });
});

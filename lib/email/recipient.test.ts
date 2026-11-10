import { beforeEach, describe, expect, it, vi } from "vitest";

/** What each `.in()` read answers, in order. */
const answers: { data: unknown[] | null; error: { message: string } | null }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: () => Promise.resolve(answers.shift()) }),
    }),
  }),
}));

const { getEmailSettingsOf, getLocalesOf } = await import("./recipient");

const row = (id: string, overrides = {}) => ({
  id,
  locale: "en",
  email_reminders: true,
  email_results: true,
  email_updates: true,
  ...overrides,
});

beforeEach(() => {
  answers.length = 0;
});

describe("getEmailSettingsOf", () => {
  it("reads each account's switches, and defaults an account with no row", async () => {
    answers.push({ data: [row("a", { email_reminders: false })], error: null });

    const settings = await getEmailSettingsOf(["a", "b"]);

    expect(settings.get("a")).toEqual({
      locale: "en",
      reminders: false,
      results: true,
      updates: true,
    });
    expect(settings.get("b")).toMatchObject({ reminders: true, results: true });
  });

  // BUG-002: a failed read must not look like "no row", whose defaults
  // switch every email on for runners who turned them off.
  it("throws when the read fails, rather than defaulting everyone to on", async () => {
    answers.push({ data: null, error: { message: "timeout" } });

    await expect(getEmailSettingsOf(["a"])).rejects.toThrow("timeout");
  });

  it("throws when one chunk of a large read fails", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    answers.push({ data: [], error: null }, { data: null, error: { message: "5xx" } });

    await expect(getEmailSettingsOf(ids)).rejects.toThrow("5xx");
  });
});

describe("getLocalesOf", () => {
  it("falls back to the default language when the read fails", async () => {
    answers.push({ data: null, error: { message: "timeout" } });

    expect((await getLocalesOf(["a"])).get("a")).toBe("es");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rate limits in front of password sign-in and recovery: that nobody can
 * use them up for someone else's address.
 */

type Check = { action: string; who: string };

const withinLimits = vi.fn<(checks: Check[]) => Promise<boolean>>();
const clientIp = vi.fn<() => Promise<string>>();
const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  LIMITS: new Proxy({}, { get: () => ({ limit: 1, window: "1 hour" }) }),
  withinLimits,
  clientIp,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, resetPasswordForEmail, signUp } }),
}));
vi.mock("@/lib/site-url", () => ({ siteOrigin: async () => "https://example.test" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("./session", () => ({ isRecoverySession: vi.fn() }));

const { requestPasswordResetAction, signInAction, signUpAction } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** Every key counted so far, as "action who". */
function counted(): string[] {
  return withinLimits.mock.calls.flatMap(([checks]) =>
    checks.map((c) => `${c.action} ${c.who}`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clientIp.mockResolvedValue("203.0.113.9");
  withinLimits.mockResolvedValue(true);
  signInWithPassword.mockResolvedValue({ error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("signInAction", () => {
  // SEC-001: an attempt counted against the address alone let anyone who
  // knew it lock its owner out by failing ten times every 15 minutes.
  it("counts the address only together with the caller's IP", async () => {
    await signInAction(undefined, form({ email: "ana@example.com", password: "x" })).catch(
      () => {},
    );

    expect(counted()).toEqual([
      "auth:signin:ip 203.0.113.9",
      "auth:signin:email-ip ana@example.com|203.0.113.9",
    ]);
  });

  it("refuses without trying the password once the caller is over a limit", async () => {
    withinLimits.mockResolvedValue(false);

    expect(
      await signInAction(undefined, form({ email: "ana@example.com", password: "x" })),
    ).toEqual({ error: "rateLimited", values: { email: "ana@example.com" } });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

// FE-004: React resets a form after its action. What was typed comes back so
// a wrong password does not clear the email too — and the password never does.
it("hands back the email, never the password, when signing in fails", async () => {
  signInWithPassword.mockResolvedValue({
    error: { code: "invalid_credentials", message: "Invalid login credentials" },
  });

  const state = await signInAction(
    undefined,
    form({ email: "ana@example.com", password: "hunter22" }),
  );
  expect(state.values).toEqual({ email: "ana@example.com" });
  expect(JSON.stringify(state)).not.toContain("hunter22");
});

describe("signUpAction", () => {
  const fields = { name: "Ana", email: "ana@example.com", password: "long-enough" };

  it("refuses an address that already has an account", async () => {
    // Supabase's decoy for a taken address: a user with no identities.
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });

    await expect(signUpAction(undefined, form(fields))).resolves.toEqual({
      error: "userAlreadyExists",
      values: { name: "Ana", email: "ana@example.com" },
    });
  });

  it("refuses a taken address when Supabase answers with an error", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists" } });

    await expect(signUpAction(undefined, form(fields))).resolves.toMatchObject({
      error: "userAlreadyExists",
    });
  });

  it("sends a new address to the inbox screen", async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{ id: "1" }] }, session: null },
      error: null,
    });

    await expect(signUpAction(undefined, form(fields))).rejects.toMatchObject({
      to: expect.stringContaining("/verify-email?email=ana%40example.com"),
    });
  });
});

describe("requestPasswordResetAction", () => {
  it("tells a caller who is over their own limit", async () => {
    withinLimits.mockResolvedValueOnce(false);

    expect(
      await requestPasswordResetAction(undefined, form({ email: "ana@example.com" })),
    ).toEqual({ error: "rateLimited", values: { email: "ana@example.com" } });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  // SEC-001: the address's limit is one a stranger can fill. Its owner must
  // not be shown an error for it; nothing more is sent, that is all.
  it("answers as usual, sending nothing, once the address is over its limit", async () => {
    withinLimits.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(
      await requestPasswordResetAction(undefined, form({ email: "ana@example.com" })),
    ).toEqual({ ok: true, email: "ana@example.com" });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(counted()).toEqual([
      "auth:reset:ip 203.0.113.9",
      "auth:reset:email ana@example.com",
    ]);
  });

  it("sends the link when both limits allow it", async () => {
    expect(
      await requestPasswordResetAction(undefined, form({ email: "ana@example.com" })),
    ).toEqual({ ok: true, email: "ana@example.com" });
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});

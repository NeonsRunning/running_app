import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The profile actions' refusals: what a form gets back when its input is
 * wrong, and that an action only ever writes its own caller's row.
 */

type Call = [method: string, ...args: unknown[]];
type Query = { table: string; calls: Call[] };

const queries: Query[] = [];
let answer: (q: Query) => { data?: unknown; error?: { message: string } | null };

const getUser = vi.fn();
const removeFiles = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/account-deletion", () => ({
  notifyTeamOfDeletionCancelled: vi.fn(),
  notifyTeamOfDeletionRequest: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  LIMITS: new Proxy({}, { get: () => ({ limit: 1, window: "1 hour" }) }),
  withinLimits: vi.fn(async () => true),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    storage: { from: () => ({ remove: removeFiles }) },
    from: (table: string) => {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_, method: string) =>
            method === "then"
              ? (resolve: (v: unknown) => void) =>
                  resolve({ data: null, error: null, ...answer(query) })
              : (...args: unknown[]) => {
                  query.calls.push([method, ...args]);
                  return chain;
                },
        },
      );
      return chain;
    },
  }),
}));

const {
  setAvatarAction,
  setEmailPreferenceAction,
  updateMailingAddressAction,
  updateProfileAction,
} = await import("./actions");

const ME = "00000000-0000-4000-8000-000000000003";
const OTHER = "00000000-0000-4000-8000-000000000004";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const writes = () => queries.filter((q) => q.calls.some(([m]) => m === "update"));

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: ME } } });
  answer = () => ({ data: { id: ME } });
});

describe("updateMailingAddressAction", () => {
  const address = {
    addressLine1: "Calle Luna 12",
    addressLine2: "Apt 3",
    addressCity: "San Juan",
    addressState: "PR",
    addressPostalCode: "nope",
  };

  // React resets a form once its action has run: without the values, one bad
  // postal code would wipe the four fields beside it.
  it("hands back what was typed along with the field's error", async () => {
    const result = await updateMailingAddressAction(undefined, form(address));

    expect(result.fieldErrors).toEqual({ addressPostalCode: "postalCodeInvalid" });
    expect(result.values).toEqual(address);
    expect(writes()).toHaveLength(0);
  });

  it("leaves React's own form fields out of the values", async () => {
    const result = await updateMailingAddressAction(
      undefined,
      form({ ...address, $ACTION_ID_abc: "1" }),
    );

    expect(result.values).not.toHaveProperty("$ACTION_ID_abc");
  });

  it("keeps the values when the session has run out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await updateMailingAddressAction(
      undefined,
      form({ ...address, addressPostalCode: "00901" }),
    );

    expect(result).toMatchObject({ error: "sessionExpired" });
    expect(result.values).toMatchObject({ addressLine1: "Calle Luna 12" });
    expect(writes()).toHaveLength(0);
  });
});

describe("updateProfileAction", () => {
  it("refuses a missing name, and writes nothing", async () => {
    const result = await updateProfileAction(
      undefined,
      form({ name: "  ", city: "Ponce", club: "", bio: "" }),
    );

    expect(result.fieldErrors).toEqual({ name: "nameRequired" });
    expect(result.values).toMatchObject({ city: "Ponce" });
    expect(writes()).toHaveLength(0);
  });

  it("writes the caller's own row, whatever the form says", async () => {
    await updateProfileAction(
      undefined,
      form({ id: OTHER, name: "Ana", city: "", club: "", bio: "", account_type: "organizer" }),
    );

    const [write] = writes();
    expect(write.table).toBe("profiles");
    expect(write.calls).toContainEqual(["eq", "id", ME]);
    const [, sent] = write.calls.find(([m]) => m === "update") as [string, object];
    expect(sent).not.toHaveProperty("account_type");
    expect(sent).not.toHaveProperty("id");
  });
});

describe("setAvatarAction", () => {
  it("refuses a photo in someone else's folder", async () => {
    const result = await setAvatarAction(
      `${OTHER}/00000000-0000-4000-a000-000000000001.webp`,
    );

    expect(result).toEqual({ error: "photoInvalid" });
    expect(writes()).toHaveLength(0);
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("refuses a path that climbs out of the caller's folder", async () => {
    const result = await setAvatarAction(`${ME}/../${OTHER}/x.webp`);

    expect(result).toEqual({ error: "photoInvalid" });
    expect(writes()).toHaveLength(0);
  });
});

describe("setEmailPreferenceAction", () => {
  it.each(["constructor", "__proto__", "toString", "locale", ""])(
    "refuses %j as a preference",
    async (preference) => {
      const result = await setEmailPreferenceAction(preference as never, false);

      expect(result).toEqual({ error: "saveFailed" });
      expect(writes()).toHaveLength(0);
    },
  );

  it("refuses a value that is not a boolean", async () => {
    const result = await setEmailPreferenceAction("reminders", "false" as never);

    expect(result).toEqual({ error: "saveFailed" });
    expect(writes()).toHaveLength(0);
  });

  it("switches one email off for the caller", async () => {
    const result = await setEmailPreferenceAction("reminders", false);

    expect(result).toEqual({ ok: true });
    const [write] = writes();
    expect(write.table).toBe("profile_private");
    expect(write.calls).toContainEqual(["update", { email_reminders: false }]);
    expect(write.calls).toContainEqual(["eq", "id", ME]);
  });
});

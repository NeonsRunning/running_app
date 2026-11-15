import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An admin correcting a reviewed result, or deleting one: what the actions
 * refuse before the database is asked, how its errors come back, and which
 * file is deleted. Who may correct or delete what is tested against Postgres
 * (supabase/tests/database/correct_result.test.sql, delete_result.test.sql).
 */

const isPlatformAdmin = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const removeFiles = vi.fn();
const createSignedUploadUrl = vi.fn();
const copyFile = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ isPlatformAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle,
    };
    return { rpc, from: () => chain };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({ remove: removeFiles, createSignedUploadUrl, copy: copyFile }),
    },
  }),
}));

const {
  correctRaceResultAction,
  deleteRaceResultAction,
  prepareEvidenceUploadAction,
  searchMoveTargetsAction,
} = await import("./corrections");

const RESULT = "00000000-0000-4000-9000-0000000000f1";
const RUNNER = "00000000-0000-4000-8000-000000000004";
/** The runner a result is moved to, their sign-up, and the event. */
const OTHER = "00000000-0000-4000-8000-000000000003";
const OTHER_SIGNUP = "00000000-0000-4000-9000-0000000000b2";
const EVENT = "00000000-0000-4000-9000-0000000000e1";
const IN_OTHER_FOLDER = new RegExp(`^${OTHER}/[0-9a-f-]{36}\\.webp$`);
const OLD = `${RUNNER}/00000000-0000-4000-9000-0000000000d1.webp`;
const NEW = `${RUNNER}/00000000-0000-4000-9000-0000000000d2.webp`;

const input = (over: Partial<Parameters<typeof correctRaceResultAction>[0]> = {}) => ({
  resultId: RESULT,
  version: "2026-11-12T10:00:00.123456+00:00",
  finishTime: "48:20",
  distanceRun: "10,01 km",
  evidence: "keep" as const,
  reason: "Wrong screenshot accepted",
  ...over,
});

const log = (over: Record<string, unknown> = {}) => ({
  data: { old_evidence_path: OLD, new_evidence_path: OLD, ...over },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  isPlatformAdmin.mockResolvedValue(true);
  rpc.mockResolvedValue(log());
  removeFiles.mockResolvedValue({ data: [], error: null });
  copyFile.mockResolvedValue({ data: { path: "copied" }, error: null });
  maybeSingle.mockReset();
});

describe("correctRaceResultAction", () => {
  it("sends the parsed time, distance and trimmed reason", async () => {
    await expect(
      correctRaceResultAction(input({ reason: "  Wrong screenshot accepted  " })),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("admin_correct_race_result", {
      p_result_id: RESULT,
      p_version: "2026-11-12T10:00:00.123456+00:00",
      p_finish_seconds: 2900,
      p_distance_run_km: 10.01,
      p_evidence_path: null,
      p_remove_evidence: false,
      p_reason: "Wrong screenshot accepted",
    });
    expect(removeFiles).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("sends a blank distance as none, for the category's", async () => {
    await correctRaceResultAction(input({ distanceRun: "  " }));
    expect(rpc.mock.calls[0][1].p_distance_run_km).toBeNull();
  });

  it.each([
    [{ finishTime: "soon" }, "timeInvalid"],
    [{ distanceRun: "far" }, "distanceInvalid"],
    [{ reason: "   " }, "reasonRequired"],
    [{ evidence: "replace" as const, newEvidencePath: "../elsewhere.png" }, "evidenceInvalid"],
    [{ evidence: "replace" as const }, "evidenceInvalid"],
    [{ resultId: "not-a-uuid" }, "correctFailed"],
    [{ version: "yesterday" }, "correctFailed"],
  ])("refuses %o before asking the database", async (over, error) => {
    await expect(correctRaceResultAction(input(over))).resolves.toEqual({ ok: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses anyone but an admin", async () => {
    isPlatformAdmin.mockResolvedValue(false);
    await expect(correctRaceResultAction(input())).resolves.toEqual({
      ok: false,
      error: "notAllowed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes the screenshot a new one replaced", async () => {
    rpc.mockResolvedValue(log({ new_evidence_path: NEW }));
    await correctRaceResultAction(input({ evidence: "replace", newEvidencePath: NEW }));
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_evidence_path: NEW,
      p_remove_evidence: false,
    });
    expect(removeFiles).toHaveBeenCalledWith([OLD]);
  });

  it("deletes a removed screenshot", async () => {
    rpc.mockResolvedValue(log({ new_evidence_path: null }));
    await correctRaceResultAction(input({ evidence: "remove" }));
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_evidence_path: null,
      p_remove_evidence: true,
    });
    expect(removeFiles).toHaveBeenCalledWith([OLD]);
  });

  it("still succeeds when the old file cannot be deleted", async () => {
    rpc.mockResolvedValue(log({ new_evidence_path: null }));
    removeFiles.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(correctRaceResultAction(input({ evidence: "remove" }))).resolves.toEqual({
      ok: true,
    });
  });

  it.each([
    ["resultChanged", "alreadyChanged"],
    ["resultMissing", "alreadyChanged"],
    ["nothingChanged", "nothingChanged"],
    ["evidenceInvalid", "evidenceInvalid"],
    ["notAllowed", "notAllowed"],
  ])("maps the database's %s to %s", async (raised, error) => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: raised } });
    await expect(correctRaceResultAction(input())).resolves.toEqual({ ok: false, error });
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("reports anything else as a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42P01", message: "nope" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(correctRaceResultAction(input())).resolves.toEqual({
      ok: false,
      error: "correctFailed",
    });
  });
});

describe("correctRaceResultAction, moving the result", () => {
  /** The result as read, then the sign-up it moves to. */
  const found = (evidencePath: string | null = OLD) =>
    maybeSingle
      .mockResolvedValueOnce({ data: { event_id: EVENT, evidence_path: evidencePath } })
      .mockResolvedValueOnce({ data: { runner_id: OTHER } });

  it("copies a kept screenshot into the new runner's folder and deletes the original", async () => {
    found();
    rpc.mockImplementation(async (_name: string, args: { p_evidence_path: string }) =>
      log({ new_evidence_path: args.p_evidence_path }),
    );
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: OTHER_SIGNUP })),
    ).resolves.toEqual({ ok: true });

    const [from, to] = copyFile.mock.calls[0];
    expect(from).toBe(OLD);
    expect(to).toMatch(IN_OTHER_FOLDER);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_evidence_path: to,
      p_remove_evidence: false,
      p_move_to_registration: OTHER_SIGNUP,
    });
    expect(removeFiles).toHaveBeenCalledWith([OLD]);
  });

  it("moves a result that has no screenshot without copying anything", async () => {
    found(null);
    rpc.mockResolvedValue(log({ old_evidence_path: null, new_evidence_path: null }));
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: OTHER_SIGNUP })),
    ).resolves.toEqual({ ok: true });
    expect(copyFile).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_evidence_path: null,
      p_move_to_registration: OTHER_SIGNUP,
    });
  });

  it("does not copy when the screenshot is replaced or removed", async () => {
    const uploaded = `${OTHER}/00000000-0000-4000-9000-0000000000d3.webp`;
    rpc.mockResolvedValue(log({ new_evidence_path: uploaded }));
    await correctRaceResultAction(
      input({
        moveToRegistrationId: OTHER_SIGNUP,
        evidence: "replace",
        newEvidencePath: uploaded,
      }),
    );
    expect(copyFile).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_evidence_path: uploaded });
  });

  it("deletes the copy when the database refuses the move", async () => {
    found();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "moveTargetHasResult" },
    });
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: OTHER_SIGNUP })),
    ).resolves.toEqual({ ok: false, error: "moveTargetHasResult" });
    expect(removeFiles).toHaveBeenCalledWith([copyFile.mock.calls[0][1]]);
  });

  it("refuses a sign-up that is not a paid one of the event", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { event_id: EVENT, evidence_path: OLD } })
      .mockResolvedValueOnce({ data: null });
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: OTHER_SIGNUP })),
    ).resolves.toEqual({ ok: false, error: "moveInvalid" });
    expect(copyFile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops when the screenshot cannot be copied", async () => {
    found();
    copyFile.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: OTHER_SIGNUP })),
    ).resolves.toEqual({ ok: false, error: "correctFailed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a sign-up id that is not one", async () => {
    await expect(
      correctRaceResultAction(input({ moveToRegistrationId: "someone" })),
    ).resolves.toEqual({ ok: false, error: "correctFailed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends no move for an ordinary correction", async () => {
    await correctRaceResultAction(input());
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_move_to_registration");
  });
});

describe("searchMoveTargetsAction", () => {
  it("returns the runners the result could move to", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          registration_id: OTHER_SIGNUP,
          runner_id: OTHER,
          runner_name: "Ana Figueroa",
          bib: 1002,
          distance: "5K",
          same_category: false,
        },
      ],
      error: null,
    });
    await expect(searchMoveTargetsAction(RESULT, "  ana ")).resolves.toEqual({
      ok: true,
      targets: [
        {
          registrationId: OTHER_SIGNUP,
          runnerName: "Ana Figueroa",
          bib: 1002,
          distance: "5K",
          sameCategory: false,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("admin_result_move_targets", {
      p_result_id: RESULT,
      p_query: "ana",
    });
  });

  it("refuses anyone but an admin", async () => {
    isPlatformAdmin.mockResolvedValue(false);
    await expect(searchMoveTargetsAction(RESULT, "")).resolves.toEqual({
      ok: false,
      error: "notAllowed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["moveMedalDelivered", "moveMedalDelivered"],
    ["moveDisqualified", "moveDisqualified"],
    ["resultMissing", "alreadyChanged"],
  ])("maps the database's %s to %s", async (raised, error) => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: raised } });
    await expect(searchMoveTargetsAction(RESULT, "")).resolves.toEqual({ ok: false, error });
  });
});

describe("prepareEvidenceUploadAction", () => {
  it("signs an upload into the new runner's folder for a result being moved", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { runner_id: RUNNER, event_id: EVENT } })
      .mockResolvedValueOnce({ data: { runner_id: OTHER } });
    createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: { path, token: "tok" },
      error: null,
    }));
    const result = await prepareEvidenceUploadAction(RESULT, OTHER_SIGNUP);
    expect(result.ok && result.path).toMatch(IN_OTHER_FOLDER);
  });

  it("signs an upload into the runner's folder", async () => {
    maybeSingle.mockResolvedValue({ data: { runner_id: RUNNER } });
    createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: { path, token: "tok" },
      error: null,
    }));
    const result = await prepareEvidenceUploadAction(RESULT);
    expect(result).toMatchObject({ ok: true, token: "tok" });
    expect(result.ok && result.path).toMatch(
      new RegExp(`^${RUNNER}/[0-9a-f-]{36}\\.webp$`),
    );
  });

  it("refuses anyone but an admin", async () => {
    isPlatformAdmin.mockResolvedValue(false);
    await expect(prepareEvidenceUploadAction(RESULT)).resolves.toEqual({
      ok: false,
      error: "notAllowed",
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a result that is not there to correct", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    await expect(prepareEvidenceUploadAction(RESULT)).resolves.toEqual({
      ok: false,
      error: "alreadyChanged",
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("deleteRaceResultAction", () => {
  const deletion = (over: Partial<Parameters<typeof deleteRaceResultAction>[0]> = {}) => ({
    resultId: RESULT,
    version: "2026-11-12T10:00:00.123456+00:00",
    reason: "Sent for the wrong race",
    ...over,
  });

  beforeEach(() => {
    rpc.mockResolvedValue({ data: { evidence_path: OLD }, error: null });
  });

  it("sends the version and trimmed reason, and deletes the screenshot", async () => {
    await expect(
      deleteRaceResultAction(deletion({ reason: "  Sent for the wrong race  " })),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("admin_delete_race_result", {
      p_result_id: RESULT,
      p_version: "2026-11-12T10:00:00.123456+00:00",
      p_reason: "Sent for the wrong race",
    });
    expect(removeFiles).toHaveBeenCalledWith([OLD]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("deletes no file for a result that had no screenshot", async () => {
    rpc.mockResolvedValue({ data: { evidence_path: null }, error: null });
    await expect(deleteRaceResultAction(deletion())).resolves.toEqual({ ok: true });
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it.each([
    [{ reason: "   " }, "reasonRequired"],
    [{ resultId: "not-a-uuid" }, "deleteFailed"],
    [{ version: "yesterday" }, "deleteFailed"],
  ])("refuses %o before asking the database", async (over, error) => {
    await expect(deleteRaceResultAction(deletion(over))).resolves.toEqual({ ok: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses anyone but an admin", async () => {
    isPlatformAdmin.mockResolvedValue(false);
    await expect(deleteRaceResultAction(deletion())).resolves.toEqual({
      ok: false,
      error: "notAllowed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("still succeeds when the screenshot cannot be deleted", async () => {
    removeFiles.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deleteRaceResultAction(deletion())).resolves.toEqual({ ok: true });
  });

  it.each([
    ["resultChanged", "alreadyChanged"],
    ["resultMissing", "alreadyChanged"],
    ["deleteMedalDelivered", "deleteMedalDelivered"],
    ["reasonRequired", "reasonRequired"],
    ["notAllowed", "notAllowed"],
  ])("maps the database's %s to %s", async (raised, error) => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: raised } });
    await expect(deleteRaceResultAction(deletion())).resolves.toEqual({ ok: false, error });
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("reports anything else as a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42P01", message: "nope" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deleteRaceResultAction(deletion())).resolves.toEqual({
      ok: false,
      error: "deleteFailed",
    });
  });
});

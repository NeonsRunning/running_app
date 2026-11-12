import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An admin correcting a reviewed result: what the actions refuse before the
 * database is asked, how its errors come back, and which file is deleted.
 * Who may correct what is tested against Postgres
 * (supabase/tests/database/correct_result.test.sql).
 */

const isPlatformAdmin = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const removeFiles = vi.fn();
const createSignedUploadUrl = vi.fn();
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
    storage: { from: () => ({ remove: removeFiles, createSignedUploadUrl }) },
  }),
}));

const { correctRaceResultAction, prepareEvidenceUploadAction } = await import(
  "./corrections"
);

const RESULT = "00000000-0000-4000-9000-0000000000f1";
const RUNNER = "00000000-0000-4000-8000-000000000004";
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

describe("prepareEvidenceUploadAction", () => {
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

"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  EVIDENCE_BUCKET,
  REVIEW_NOTE_MAX,
  isOwnEvidencePath,
  parseDistanceRun,
  parseFinishTime,
} from "./evidence";

/**
 * A platform admin correcting a reviewed result: the time, the distance the
 * runner's app recorded, and the screenshot — kept, removed, or replaced.
 * The runner is not emailed.
 *
 * `admin_correct_race_result()` decides who may and what is allowed; the
 * checks here are for the message. Errors are keys under
 * `resultCorrection.errors`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `raise exception` in our own functions; the message is an error key. */
const RAISED = "P0001";

export type PrepareUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: "notAllowed" | "alreadyChanged" | "uploadFailed" };

/**
 * A one-time signed upload into the runner's evidence folder, where a
 * result's screenshot must live. The admin's browser uploads the converted
 * file with it, then passes the path to `correctRaceResultAction`. Signed
 * rather than uploaded through this action: a screenshot can be up to 5 MB,
 * and an action's request is capped at 1 MB. A file never saved is cleared
 * by the daily evidence sweep.
 */
export async function prepareEvidenceUploadAction(
  resultId: string,
): Promise<PrepareUploadResult> {
  if (typeof resultId !== "string" || !UUID.test(resultId)) {
    return { ok: false, error: "uploadFailed" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  // Read as the admin, through RLS.
  const supabase = await createClient();
  const { data: result } = await supabase
    .from("race_results")
    .select("runner_id")
    .eq("id", resultId)
    .in("status", ["accepted", "disqualified"])
    .maybeSingle();
  if (!result) return { ok: false, error: "alreadyChanged" };

  const path = `${result.runner_id}/${crypto.randomUUID()}.webp`;
  const { data, error } = await createAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error(`Signing an evidence upload for ${resultId} failed:`, error?.message);
    return { ok: false, error: "uploadFailed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

export type CorrectionInput = {
  resultId: string;
  /** The result's version as the admin was shown it (`CorrectableResult.version`). */
  version: string;
  finishTime: string;
  /** Blank: pace over the category's distance. */
  distanceRun: string;
  evidence: "keep" | "remove" | "replace";
  /** With `evidence: "replace"`: the file uploaded through `prepareEvidenceUploadAction`. */
  newEvidencePath?: string;
  reason: string;
};

export type CorrectionError =
  | "notAllowed"
  | "alreadyChanged"
  | "timeInvalid"
  | "distanceInvalid"
  | "evidenceInvalid"
  | "reasonRequired"
  | "nothingChanged"
  | "correctFailed";

export type CorrectionResult = { ok: true } | { ok: false; error: CorrectionError };

const CORRECTION_ERRORS = new Set<string>([
  "notAllowed",
  "timeInvalid",
  "distanceInvalid",
  "evidenceInvalid",
  "reasonRequired",
  "nothingChanged",
]);

/**
 * Save the correction. A screenshot it replaced or removed is deleted at
 * once — it was wrong, and may show where the runner lives — and stays
 * named in `race_result_corrections`.
 */
export async function correctRaceResultAction(
  input: CorrectionInput,
): Promise<CorrectionResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "correctFailed" };
  const { resultId, version, finishTime, distanceRun, evidence, newEvidencePath, reason } =
    input;
  if (
    typeof resultId !== "string" ||
    !UUID.test(resultId) ||
    typeof version !== "string" ||
    Number.isNaN(Date.parse(version)) ||
    !["keep", "remove", "replace"].includes(evidence)
  ) {
    return { ok: false, error: "correctFailed" };
  }

  const seconds = typeof finishTime === "string" ? parseFinishTime(finishTime) : null;
  if (seconds === null) return { ok: false, error: "timeInvalid" };
  if (typeof distanceRun !== "string") return { ok: false, error: "distanceInvalid" };
  const km = distanceRun.trim() ? parseDistanceRun(distanceRun) : null;
  if (distanceRun.trim() && km === null) return { ok: false, error: "distanceInvalid" };

  const trimmed = typeof reason === "string" ? reason.trim().slice(0, REVIEW_NOTE_MAX) : "";
  if (!trimmed) return { ok: false, error: "reasonRequired" };

  if (evidence === "replace") {
    // The folder is checked against the runner's by the database.
    const folder = typeof newEvidencePath === "string" ? newEvidencePath.split("/")[0] : "";
    if (!isOwnEvidencePath(String(newEvidencePath), folder)) {
      return { ok: false, error: "evidenceInvalid" };
    }
  }

  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_correct_race_result", {
    p_result_id: resultId,
    p_version: version,
    p_finish_seconds: seconds,
    p_distance_run_km: km,
    p_evidence_path: evidence === "replace" ? (newEvidencePath ?? null) : null,
    p_remove_evidence: evidence === "remove",
    p_reason: trimmed,
  });

  if (error || !data) {
    const key = error?.code === RAISED ? error.message : "";
    if (CORRECTION_ERRORS.has(key)) return { ok: false, error: key as CorrectionError };
    // Corrected, reviewed or disqualified meanwhile: the refreshed page
    // shows which.
    if (key === "resultMissing" || key === "resultChanged") {
      revalidatePath("/", "layout");
      return { ok: false, error: "alreadyChanged" };
    }
    console.error(`Correcting result ${resultId} failed:`, error?.message);
    return { ok: false, error: "correctFailed" };
  }

  // Best effort: the daily sweep deletes it if this does not.
  if (data.old_evidence_path && data.old_evidence_path !== data.new_evidence_path) {
    const { error: removeError } = await createAdminClient()
      .storage.from(EVIDENCE_BUCKET)
      .remove([data.old_evidence_path]);
    if (removeError) {
      console.error(`Deleting replaced evidence of ${resultId} failed:`, removeError.message);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

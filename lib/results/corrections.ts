"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Distance } from "@/lib/types";
import {
  EVIDENCE_BUCKET,
  REVIEW_NOTE_MAX,
  isOwnEvidencePath,
  parseDistanceRun,
  parseFinishTime,
} from "./evidence";

/**
 * A platform admin correcting a reviewed result: the time, the distance the
 * runner's app recorded, and the screenshot — kept, removed, or replaced —
 * and, for a finish sent from the wrong account, whose result it is: moved
 * to another paid runner of the same event. Nobody is emailed.
 *
 * `admin_correct_race_result()` decides who may and what is allowed; the
 * checks here are for the message. Errors are keys under
 * `resultCorrection.errors`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `raise exception` in our own functions; the message is an error key. */
const RAISED = "P0001";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The runner of a paid sign-up of `eventId`, the one a result is moving to;
 * null if there is none. Read as the admin, through RLS.
 */
async function moveTargetRunner(
  supabase: Supabase,
  registrationId: string,
  eventId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("registrations")
    .select("runner_id")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .maybeSingle();
  return data?.runner_id ?? null;
}

export type MoveTarget = {
  registrationId: string;
  runnerName: string;
  bib: number;
  /** What they signed up for; the result takes it. */
  distance: Distance;
  /** False when that is not the distance the result is under now. */
  sameCategory: boolean;
};

export type MoveTargetsResult =
  | { ok: true; targets: MoveTarget[] }
  | {
      ok: false;
      error:
        | "notAllowed"
        | "alreadyChanged"
        | "moveDisqualified"
        | "moveMedalDelivered"
        | "searchFailed";
    };

const MOVE_TARGET_ERRORS = new Set<string>([
  "notAllowed",
  "moveDisqualified",
  "moveMedalDelivered",
]);

/**
 * The runners a result could be moved to, for the dialog's lookup: the
 * event's other paid sign-ups without a reviewed result of their own, by
 * name or bib. Refused outright — before any search — for a result that
 * cannot be moved at all (`admin_result_move_targets()`).
 */
export async function searchMoveTargetsAction(
  resultId: string,
  query: string,
): Promise<MoveTargetsResult> {
  if (typeof resultId !== "string" || !UUID.test(resultId) || typeof query !== "string") {
    return { ok: false, error: "searchFailed" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_result_move_targets", {
    p_result_id: resultId,
    p_query: query.trim().slice(0, 100),
  });

  if (error || !data) {
    const key = error?.code === RAISED ? error.message : "";
    if (MOVE_TARGET_ERRORS.has(key)) return { ok: false, error: key as "notAllowed" };
    if (key === "resultMissing") return { ok: false, error: "alreadyChanged" };
    console.error(`Looking up where to move ${resultId} failed:`, error?.message);
    return { ok: false, error: "searchFailed" };
  }

  return {
    ok: true,
    targets: data.map((r) => ({
      registrationId: r.registration_id,
      runnerName: r.runner_name,
      bib: r.bib,
      distance: r.distance,
      sameCategory: r.same_category,
    })),
  };
}

export type PrepareUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: "notAllowed" | "alreadyChanged" | "moveInvalid" | "uploadFailed" };

/**
 * A one-time signed upload into the runner's evidence folder, where a
 * result's screenshot must live. The admin's browser uploads the converted
 * file with it, then passes the path to `correctRaceResultAction`. Signed
 * rather than uploaded through this action: a screenshot can be up to 5 MB,
 * and an action's request is capped at 1 MB. A file never saved is cleared
 * by the daily evidence sweep.
 *
 * With `moveToRegistrationId` — the result is being moved — the folder is
 * that sign-up's runner's.
 */
export async function prepareEvidenceUploadAction(
  resultId: string,
  moveToRegistrationId?: string,
): Promise<PrepareUploadResult> {
  if (typeof resultId !== "string" || !UUID.test(resultId)) {
    return { ok: false, error: "uploadFailed" };
  }
  if (
    moveToRegistrationId !== undefined &&
    (typeof moveToRegistrationId !== "string" || !UUID.test(moveToRegistrationId))
  ) {
    return { ok: false, error: "uploadFailed" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAllowed" };

  // Read as the admin, through RLS.
  const supabase = await createClient();
  const { data: result } = await supabase
    .from("race_results")
    .select("runner_id, event_id")
    .eq("id", resultId)
    .in("status", ["accepted", "disqualified"])
    .maybeSingle();
  if (!result) return { ok: false, error: "alreadyChanged" };

  const runnerId = moveToRegistrationId
    ? await moveTargetRunner(supabase, moveToRegistrationId, result.event_id)
    : result.runner_id;
  if (!runnerId) return { ok: false, error: "moveInvalid" };

  const path = `${runnerId}/${crypto.randomUUID()}.webp`;
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
  /**
   * Move the result to this paid sign-up of the same event, whose runner it
   * becomes. A screenshot kept is copied into their folder; one uploaded
   * must already be there (`prepareEvidenceUploadAction`'s second argument).
   */
  moveToRegistrationId?: string;
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
  | "moveInvalid"
  | "moveDisqualified"
  | "moveMedalDelivered"
  | "moveTargetHasResult"
  | "correctFailed";

export type CorrectionResult = { ok: true } | { ok: false; error: CorrectionError };

const CORRECTION_ERRORS = new Set<string>([
  "notAllowed",
  "timeInvalid",
  "distanceInvalid",
  "evidenceInvalid",
  "reasonRequired",
  "nothingChanged",
  "moveInvalid",
  "moveDisqualified",
  "moveMedalDelivered",
  "moveTargetHasResult",
]);

type CarriedEvidence =
  | { ok: true; path: string | null }
  | { ok: false; error: "alreadyChanged" | "moveInvalid" | "correctFailed" };

/**
 * A result's screenshot must live in its runner's folder, so one that moves
 * with the result is copied into the new runner's first. `path` is the copy,
 * or null for a result that has no screenshot.
 */
async function carryEvidence(
  supabase: Supabase,
  resultId: string,
  moveToRegistrationId: string,
): Promise<CarriedEvidence> {
  const { data: result } = await supabase
    .from("race_results")
    .select("event_id, evidence_path")
    .eq("id", resultId)
    .eq("status", "accepted")
    .maybeSingle();
  if (!result) return { ok: false, error: "alreadyChanged" };
  if (!result.evidence_path) return { ok: true, path: null };

  const runnerId = await moveTargetRunner(supabase, moveToRegistrationId, result.event_id);
  if (!runnerId) return { ok: false, error: "moveInvalid" };

  const path = `${runnerId}/${crypto.randomUUID()}.webp`;
  const { error } = await createAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .copy(result.evidence_path, path);
  if (error) {
    console.error(`Copying the evidence of ${resultId} failed:`, error.message);
    return { ok: false, error: "correctFailed" };
  }
  return { ok: true, path };
}

/**
 * Save the correction. A screenshot it replaced or removed is deleted at
 * once — it was wrong, and may show where the runner lives — and stays
 * named in `race_result_corrections`. So is the original of one copied for
 * a move: it leaves the folder of the runner the result was taken from.
 */
export async function correctRaceResultAction(
  input: CorrectionInput,
): Promise<CorrectionResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "correctFailed" };
  const {
    resultId,
    version,
    finishTime,
    distanceRun,
    evidence,
    newEvidencePath,
    moveToRegistrationId,
    reason,
  } = input;
  const moving = moveToRegistrationId !== undefined;
  if (
    typeof resultId !== "string" ||
    !UUID.test(resultId) ||
    typeof version !== "string" ||
    Number.isNaN(Date.parse(version)) ||
    !["keep", "remove", "replace"].includes(evidence) ||
    (moving && (typeof moveToRegistrationId !== "string" || !UUID.test(moveToRegistrationId)))
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

  let evidencePath = evidence === "replace" ? (newEvidencePath ?? null) : null;
  // The copy made for a move, to delete again if the move is refused.
  let copied: string | null = null;
  if (moving && evidence === "keep") {
    const carried = await carryEvidence(supabase, resultId, moveToRegistrationId);
    if (!carried.ok) {
      if (carried.error === "alreadyChanged") revalidatePath("/", "layout");
      return { ok: false, error: carried.error };
    }
    evidencePath = copied = carried.path;
  }

  const { data, error } = await supabase.rpc("admin_correct_race_result", {
    p_result_id: resultId,
    p_version: version,
    p_finish_seconds: seconds,
    p_distance_run_km: km,
    p_evidence_path: evidencePath,
    p_remove_evidence: evidence === "remove",
    p_reason: trimmed,
    ...(moving ? { p_move_to_registration: moveToRegistrationId } : {}),
  });

  if (error || !data) {
    // Best effort: the daily sweep deletes it if this does not.
    if (copied) {
      await createAdminClient().storage.from(EVIDENCE_BUCKET).remove([copied]);
    }
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

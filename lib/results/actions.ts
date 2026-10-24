"use server";

import { revalidatePath } from "next/cache";
import { scheduleReviewRequestedEmail } from "@/lib/email/review-requested";
import { scheduleResultReviewedEmail } from "@/lib/email/result-reviewed";
import { createClient } from "@/lib/supabase/server";
import {
  EVIDENCE_BUCKET,
  REVIEW_NOTE_MAX,
  isOwnEvidencePath,
  parseFinishTime,
} from "./evidence";

/**
 * Sending and reviewing finish evidence.
 *
 * Errors come back as keys under `raceResult.errors` (the runner's side) and
 * `resultReview.errors` (the organizer's). Who may do what is decided by
 * `submit_race_result()` and `review_race_result()`; the checks here are for
 * the message.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `raise exception` in our own functions; the message is an error key. */
const RAISED = "P0001";

const SUBMIT_ERRORS = new Set([
  "resultsClosed",
  "raceNotStarted",
  "notRegistered",
  "resultAlreadyAccepted",
]);

export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "sessionExpired"
        | "timeInvalid"
        | "evidenceInvalid"
        | "resultsClosed"
        | "raceNotStarted"
        | "notRegistered"
        | "resultAlreadyAccepted"
        | "submitFailed";
    };

/**
 * Send a finish time with the screenshot already uploaded to `evidencePath`.
 * Sending again while it waits for review, or after a rejection, replaces
 * the earlier one, whose file is then deleted.
 */
export async function submitRaceResultAction(
  eventId: string,
  finishTime: string,
  evidencePath: string,
): Promise<SubmitResult> {
  if (typeof eventId !== "string" || !UUID.test(eventId)) {
    return { ok: false, error: "resultsClosed" };
  }
  const seconds = typeof finishTime === "string" ? parseFinishTime(finishTime) : null;
  if (seconds === null) return { ok: false, error: "timeInvalid" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "sessionExpired" };
  if (typeof evidencePath !== "string" || !isOwnEvidencePath(evidencePath, auth.user.id)) {
    return { ok: false, error: "evidenceInvalid" };
  }

  // The file this one replaces, if any, to clean up after.
  const { data: previous } = await supabase
    .from("race_results")
    .select("evidence_path, status")
    .eq("runner_id", auth.user.id)
    .eq("event_id", eventId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("submit_race_result", {
    p_event_id: eventId,
    p_finish_seconds: seconds,
    p_evidence_path: evidencePath,
  });

  if (error || !data) {
    if (error?.code === RAISED && SUBMIT_ERRORS.has(error.message)) {
      return { ok: false, error: error.message as "resultsClosed" };
    }
    console.error(`Submitting a result for ${eventId} failed:`, error?.message);
    return { ok: false, error: "submitFailed" };
  }

  // Best effort: a leftover file costs storage, not correctness.
  if (previous && previous.evidence_path !== evidencePath) {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([previous.evidence_path]);
  }

  // A replacement for one still waiting adds nothing new to review.
  if (previous?.status !== "pending") {
    await scheduleReviewRequestedEmail(data.registration_id, {
      kind: "result",
      finishSeconds: data.finish_seconds,
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ReviewResult =
  | { ok: true }
  | { ok: false; error: "notAllowed" | "alreadyReviewed" | "reviewFailed" };

/**
 * Accept: the result goes on the runner's profile, with the event's medal.
 * Reject: the runner sees `note` and can send new evidence. Either way the
 * runner is emailed.
 */
export async function reviewRaceResultAction(
  resultId: string,
  accept: boolean,
  note?: string,
): Promise<ReviewResult> {
  if (
    typeof resultId !== "string" ||
    !UUID.test(resultId) ||
    typeof accept !== "boolean"
  ) {
    return { ok: false, error: "reviewFailed" };
  }
  const trimmed =
    typeof note === "string" ? note.trim().slice(0, REVIEW_NOTE_MAX) : "";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_race_result", {
    p_result_id: resultId,
    p_accept: accept,
    p_note: trimmed || null,
  });

  if (error || !data) {
    const key = error?.code === RAISED ? error.message : "";
    if (key === "notAllowed") return { ok: false, error: "notAllowed" };
    // Someone else reviewed it first, or the runner re-sent it meanwhile.
    if (key === "resultMissing") return { ok: false, error: "alreadyReviewed" };
    console.error(`Reviewing result ${resultId} failed:`, error?.message);
    return { ok: false, error: "reviewFailed" };
  }

  await scheduleResultReviewedEmail(data);
  revalidatePath("/", "layout");
  return { ok: true };
}

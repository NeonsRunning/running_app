import "server-only";
import { eventImageUrl } from "@/lib/events/images";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import type { Distance } from "@/lib/types";
import { EVIDENCE_BUCKET } from "./evidence";

/**
 * Reading race results.
 *
 * Row-level security decides who sees what: a runner sees all of their own
 * submissions, an organizer sees the ones for their events, and anyone sees
 * an accepted result whose runner's profile they can see.
 */

export type ResultStatus = Enums<"result_status">;

/** Signed evidence links last long enough to review a queue. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Signed URLs by path; a path that fails to sign is simply left out. */
async function signEvidence(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  return new Map(
    (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])),
  );
}

/* -------------------------------------------------------------------------- */
/* The runner's own submission for one event                                  */
/* -------------------------------------------------------------------------- */

export type OwnResult = {
  status: ResultStatus;
  finishSeconds: number;
  reviewNote: string | null;
  /** Why it was disqualified, once it is. */
  disqualificationReason: string | null;
  submittedAt: string;
  evidenceUrl: string | null;
};

/** The caller's submission for an event, or null if they have not sent one. */
export async function getOwnResult(
  runnerId: string,
  eventId: string,
): Promise<OwnResult | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("race_results")
    .select(
      "status, finish_seconds, review_note, disqualification_reason, submitted_at, evidence_path",
    )
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!data) return null;

  const urls = await signEvidence([data.evidence_path]);
  return {
    status: data.status,
    finishSeconds: data.finish_seconds,
    reviewNote: data.review_note,
    disqualificationReason: data.disqualification_reason,
    submittedAt: data.submitted_at,
    evidenceUrl: urls.get(data.evidence_path) ?? null,
  };
}

/**
 * The caller's accepted finish time for an event, in seconds, or null while
 * they have no result the organizer accepted. Skips the evidence link
 * `getOwnResult` signs, which the finisher screen does not show.
 */
export async function getOwnFinish(
  runnerId: string,
  eventId: string,
): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("race_results")
    .select("finish_seconds")
    .eq("runner_id", runnerId)
    .eq("event_id", eventId)
    .eq("status", "accepted")
    .maybeSingle();
  return data?.finish_seconds ?? null;
}

/* -------------------------------------------------------------------------- */
/* The organizer's queue                                                      */
/* -------------------------------------------------------------------------- */

export type ResultSubmissionRow = {
  id: string;
  runnerName: string;
  bib: string;
  distance: Distance;
  finishSeconds: number;
  submittedAt: string;
  /** Null if the file could not be signed; the row still shows. */
  evidenceUrl: string | null;
};

/**
 * One event's submissions waiting for review, oldest first. Read through
 * RLS, so it is empty for anyone but the event's organizer.
 */
export async function listEventResultSubmissions(
  eventId: string,
): Promise<ResultSubmissionRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("race_results")
    .select(
      "id, finish_seconds, submitted_at, evidence_path, registration:registrations!race_results_registration_id_fkey (first_name, last_name, bib), category:event_categories!race_results_category_id_fkey (distance)",
    )
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("submitted_at");
  if (error || !data) return [];

  const urls = await signEvidence(data.map((r) => r.evidence_path));
  return data.map((r) => ({
    id: r.id,
    runnerName: r.registration
      ? `${r.registration.first_name} ${r.registration.last_name}`.trim()
      : "",
    bib: r.registration?.bib == null ? "" : String(r.registration.bib),
    distance: r.category?.distance ?? "5K",
    finishSeconds: r.finish_seconds,
    submittedAt: r.submitted_at,
    evidenceUrl: urls.get(r.evidence_path) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* The organizer's finishers                                                  */
/* -------------------------------------------------------------------------- */

export type EventFinisherRow = ResultSubmissionRow & {
  status: "accepted" | "rejected" | "disqualified";
  /** The organizer's note, on a rejection. */
  reviewNote: string | null;
  reviewedAt: string | null;
  disqualificationReason: string | null;
  disqualifiedAt: string | null;
};

/**
 * One event's reviewed results: the accepted ones and those disqualified
 * since, fastest first, then the ones sent back. Read through RLS, so it is
 * empty for anyone but the event's organizer and admins.
 */
export async function listEventFinishers(
  eventId: string,
): Promise<EventFinisherRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("race_results")
    .select(
      "id, status, finish_seconds, submitted_at, reviewed_at, review_note, evidence_path, disqualification_reason, disqualified_at, registration:registrations!race_results_registration_id_fkey (first_name, last_name, bib), category:event_categories!race_results_category_id_fkey (distance)",
    )
    .eq("event_id", eventId)
    .in("status", ["accepted", "rejected", "disqualified"])
    .order("finish_seconds");
  if (error || !data) return [];

  const urls = await signEvidence(data.map((r) => r.evidence_path));
  const rows: EventFinisherRow[] = data.map((r) => ({
    id: r.id,
    status:
      r.status === "disqualified" || r.status === "rejected" ? r.status : "accepted",
    runnerName: r.registration
      ? `${r.registration.first_name} ${r.registration.last_name}`.trim()
      : "",
    bib: r.registration?.bib == null ? "" : String(r.registration.bib),
    distance: r.category?.distance ?? "5K",
    finishSeconds: r.finish_seconds,
    submittedAt: r.submitted_at,
    evidenceUrl: urls.get(r.evidence_path) ?? null,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    disqualificationReason: r.disqualification_reason,
    disqualifiedAt: r.disqualified_at,
  }));
  // A rejected time was never a finish, so it does not rank among them.
  return rows.sort(
    (a, b) => Number(a.status === "rejected") - Number(b.status === "rejected"),
  );
}

/* -------------------------------------------------------------------------- */
/* A runner's results, for their profile                                      */
/* -------------------------------------------------------------------------- */

export type RunnerResultRow = {
  id: string;
  status: ResultStatus;
  eventName: string;
  eventSlug: string;
  /** Taken down by a platform admin: the result stands, the page is gone. */
  eventRemoved: boolean;
  eventDate: string;
  medalImage: string | undefined;
  distance: Distance;
  distanceKm: number;
  finishSeconds: number;
  reviewNote: string | null;
  disqualificationReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

/**
 * A runner's results, newest race first. Only accepted ones unless
 * `includeUnreviewed` — the runner's own view, which also lists what is
 * waiting for review and what was sent back.
 */
export async function listRunnerResults(
  runnerId: string,
  { includeUnreviewed = false }: { includeUnreviewed?: boolean } = {},
): Promise<RunnerResultRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("race_results")
    .select(
      "id, status, finish_seconds, review_note, disqualification_reason, submitted_at, reviewed_at, event:events!race_results_event_id_fkey (name, slug, status, event_date, medal_image_path), category:event_categories!race_results_category_id_fkey (distance, distance_km)",
    )
    .eq("runner_id", runnerId);
  // An organizer looking at a runner would otherwise see the pending ones
  // for their own events too.
  if (!includeUnreviewed) query = query.eq("status", "accepted");

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .flatMap((r) =>
      r.event && r.category
        ? [
            {
              id: r.id,
              status: r.status,
              eventName: r.event.name,
              eventSlug: r.event.slug,
              eventRemoved: r.event.status === "removed",
              eventDate: r.event.event_date ?? "",
              medalImage: eventImageUrl(r.event.medal_image_path),
              distance: r.category.distance,
              distanceKm: Number(r.category.distance_km),
              finishSeconds: r.finish_seconds,
              reviewNote: r.review_note,
              disqualificationReason: r.disqualification_reason,
              submittedAt: r.submitted_at,
              reviewedAt: r.reviewed_at,
            },
          ]
        : [],
    )
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

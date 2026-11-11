"use client";

import { useId, useState, type ReactNode } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { focusFirstInvalid } from "@/components/ui/focus";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import { ImageConversionError, toWebp } from "@/lib/events/convert-image";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { puertoRicoDate } from "@/lib/dates";
import {
  EVIDENCE_BUCKET,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_EDGE,
  formatFinishTime,
  parseFinishTime,
} from "@/lib/results/evidence";
import { submitRaceResultAction } from "@/lib/results/actions";
import type { OwnResult } from "@/lib/results/queries";
import { createClient } from "@/lib/supabase/client";

/**
 * The runner's side of finish evidence, in the event page's booking rail.
 *
 * Before race day it only says what is coming. From race day on, a runner
 * with a paid sign-up sends a screenshot of their run and their finish time;
 * the screenshot is converted to WebP and uploaded from the browser into the
 * runner's folder of the private `race-evidence` bucket, and only its path
 * goes to the server action. Then the card follows the review: waiting,
 * accepted, or sent back with the organizer's note and the form again. A
 * disqualified result shows the reason, and no form.
 */
export function ResultSubmission({
  eventId,
  raceDay,
  own,
}: {
  eventId: string;
  /** Whether the race has started, Puerto Rico time. */
  raceDay: boolean;
  own: OwnResult | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const { toast } = useToast();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [timeError, setTimeError] = useState<string>();
  const [fileError, setFileError] = useState(false);
  const [phase, setPhase] = useState<"converting" | "uploading" | "saving" | null>(null);
  const [replacing, setReplacing] = useState(false);
  const busy = phase !== null;

  if (!raceDay) {
    return (
      <Shell>
        <p className="mt-3 text-[14px] text-fg-dim">{t("raceResult.beforeRace")}</p>
      </Shell>
    );
  }

  if (own?.status === "accepted") {
    return (
      <Shell>
        <div className="mt-3 flex items-center gap-3">
          <Badge tone="lime">{t("raceResult.accepted")}</Badge>
          <span className="font-mono text-xl text-neon-lime tabular-nums">
            {formatFinishTime(own.finishSeconds)}
          </span>
        </div>
        <p className="mt-3 text-[14px] text-fg-dim">{t("raceResult.acceptedBody")}</p>
        <Button href={SELF_PROFILE_PATH} variant="outline" size="sm" className="mt-4">
          {t("raceResult.viewProfile")}
        </Button>
      </Shell>
    );
  }

  if (own?.status === "disqualified") {
    return (
      <Shell>
        <div className="mt-3 border-2 border-danger/60 bg-danger/8 p-4">
          <Badge tone="danger">{t("raceResult.disqualified")}</Badge>
          <p className="mt-3 text-[14px] text-fg-muted">
            {own.disqualificationReason
              ? t("raceResult.disqualifiedNote", { reason: own.disqualificationReason })
              : t("raceResult.disqualifiedBody")}
          </p>
        </div>
      </Shell>
    );
  }

  function pick(next: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next ?? null);
    setPreview(next ? URL.createObjectURL(next) : null);
    if (next) setFileError(false);
  }

  function fail(key: string) {
    toast({
      title: t("raceResult.errors.title"),
      body: t(`raceResult.errors.${key}`),
      tone: "danger",
    });
  }

  async function submit() {
    if (!file) {
      setFileError(true);
      focusFirstInvalid();
      return;
    }
    if (parseFinishTime(time) === null) {
      setTimeError(t("raceResult.errors.timeInvalid"));
      focusFirstInvalid();
      return;
    }
    setTimeError(undefined);

    setPhase("converting");
    try {
      const webp = await toWebp(file, { maxEdge: EVIDENCE_MAX_EDGE });
      if (webp.size > EVIDENCE_MAX_BYTES) return fail("imageTooLarge");

      setPhase("uploading");
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return fail("sessionExpired");

      const path = `${data.user.id}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(path, webp, { contentType: "image/webp" });
      if (error) return fail("uploadFailed");

      setPhase("saving");
      // Thrown when the request never got an answer: the result may or may
      // not have been saved with this file as its evidence, so leave the
      // file rather than risk deleting what the organizer is about to open.
      const result = await submitRaceResultAction(eventId, time, path).catch(
        () => ({ ok: false, error: "submitFailed", unanswered: true }) as const,
      );
      if (!result.ok) {
        // Refused by the server: nothing points at it now.
        if (!("unanswered" in result)) {
          void supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
        }
        if (result.error === "timeInvalid") {
          setTimeError(t("raceResult.errors.timeInvalid"));
          return;
        }
        return fail(result.error);
      }

      toast({
        title: t("raceResult.sentTitle"),
        body: t("raceResult.sentBody"),
      });
      pick(undefined);
      setTime("");
      setReplacing(false);
    } catch (e) {
      fail(e instanceof ImageConversionError ? e.code : "uploadFailed");
    } finally {
      setPhase(null);
    }
  }

  const status =
    own?.status === "pending" ? (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="yellow">{t("raceResult.pending")}</Badge>
          <span className="font-mono text-xl tabular-nums">
            {formatFinishTime(own.finishSeconds)}
          </span>
        </div>
        <p className="mt-3 text-[14px] text-fg-dim">
          {t("raceResult.pendingBody", {
            date: fmt.mediumDate(puertoRicoDate(own.submittedAt)),
          })}
        </p>
      </div>
    ) : own?.status === "rejected" ? (
      <div className="mt-3 border-2 border-danger/60 bg-danger/8 p-4">
        <Badge tone="danger">{t("raceResult.rejected")}</Badge>
        <p className="mt-3 text-[14px] text-fg-muted">
          {own.reviewNote
            ? t("raceResult.rejectedNote", { note: own.reviewNote })
            : t("raceResult.rejectedBody")}
        </p>
      </div>
    ) : (
      <p className="mt-3 text-[14px] text-fg-dim">{t("raceResult.intro")}</p>
    );

  const showForm = !own || own.status === "rejected" || replacing;

  return (
    <Shell>
      {status}

      {own?.evidenceUrl && own.status === "pending" && !replacing ? (
        <>
          <a
            href={own.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block border-2 border-line hover:border-neon-lime"
          >
            {/* A signed Storage URL; next/image would need the host configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={own.evidenceUrl}
              alt={t("raceResult.evidenceAlt")}
              className="max-h-56 w-full bg-carbon object-contain"
            />
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setReplacing(true)}
          >
            {t("raceResult.replace")}
          </Button>
        </>
      ) : null}

      {showForm ? (
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col">
            <label
              htmlFor={fileId}
              className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase"
            >
              {t("raceResult.evidence")}
            </label>
            <label
              htmlFor={fileId}
              className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-line-strong bg-carbon p-3 text-center text-[13px] text-fg-dim hover:border-neon-lime has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon-yellow"
            >
              {preview ? (
                // A local object URL of the picked file.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={file?.name ?? ""} className="max-h-48 object-contain" />
              ) : (
                <span>{t("raceResult.choose")}</span>
              )}
              <input
                id={fileId}
                type="file"
                // HEIC by extension too: some pickers hide it under image/*.
                accept="image/*,.heic,.heif"
                className="sr-only"
                disabled={busy}
                aria-invalid={fileError || undefined}
                aria-describedby={fileError ? `${fileId}-error` : undefined}
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </label>
            {fileError ? (
              <p
                id={`${fileId}-error`}
                role="alert"
                className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-danger"
              >
                <span aria-hidden="true">▲</span>
                {t("raceResult.errors.evidenceRequired")}
              </p>
            ) : null}
            <p className="mt-2 text-[12px] text-fg-dim">{t("raceResult.evidenceHint")}</p>
          </div>

          <Field
            label={t("raceResult.finishTime")}
            hint={t("raceResult.finishTimeHint")}
            error={timeError}
          >
            {(p) => (
              <Input
                {...p}
                name="finish_time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onBlur={() => {
                  // Show how a loose entry ("12541", "1.25.41") was read.
                  const seconds = parseFinishTime(time);
                  if (seconds !== null) setTime(formatFinishTime(seconds));
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0:25:41"
                className="font-mono tabular-nums"
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="md" disabled={busy} aria-busy={busy}>
              {phase ? t(`raceResult.phase.${phase}`) : t("raceResult.submit")}
            </Button>
            {replacing ? (
              <Button
                variant="ghost"
                size="md"
                disabled={busy}
                onClick={() => setReplacing(false)}
              >
                {t("raceResult.cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="border-b-2 border-line px-5 py-7 sm:px-7">
      <Eyebrow>{t("raceResult.title")}</Eyebrow>
      {children}
    </div>
  );
}

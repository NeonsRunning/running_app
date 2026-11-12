"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { focusFirstInvalid } from "@/components/ui/focus";
import { Modal } from "@/components/ui/modal";
import { RadioGroup } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { ImageConversionError, toWebp } from "@/lib/events/convert-image";
import { distanceLabel } from "@/lib/i18n/labels";
import {
  correctRaceResultAction,
  prepareEvidenceUploadAction,
  type CorrectionInput,
} from "@/lib/results/corrections";
import {
  EVIDENCE_BUCKET,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_EDGE,
  REVIEW_NOTE_MAX,
  formatFinishTime,
  parseDistanceRun,
  parseFinishTime,
} from "@/lib/results/evidence";
import type { CorrectableResult } from "@/lib/results/queries";
import { createClient } from "@/lib/supabase/client";

type Evidence = CorrectionInput["evidence"];
type Phase = "converting" | "uploading" | "saving";

/**
 * A platform admin's "Edit result": correct the finish time, the distance
 * the runner's app recorded, and the screenshot — keep it, remove it, or
 * upload the right one in its place. A reason is required and kept with
 * the correction; the runner is not emailed. Used from the profile's race
 * history and from the event's reviewed results.
 */
export function CorrectResultButton({
  result,
  className,
}: {
  result: CorrectableResult;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Remounted on each open, so the form starts from the result as it is now.
  const [session, setSession] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        aria-label={t("resultCorrection.editAria", {
          name: result.runnerName,
          event: result.eventName,
        })}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {t("resultCorrection.edit")}
      </Button>
      {open ? (
        <CorrectResultDialog key={session} result={result} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function CorrectResultDialog({
  result,
  onClose,
}: {
  result: CorrectableResult;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const formId = useId();
  const fileId = useId();
  const hasEvidence = !result.recorded && !result.evidenceRemoved;

  const [time, setTime] = useState(formatFinishTime(result.finishSeconds));
  const [timeError, setTimeError] = useState<string>();
  const [distance, setDistance] = useState(
    result.distanceRunKm === null ? "" : String(result.distanceRunKm),
  );
  const [distanceError, setDistanceError] = useState<string>();
  const [evidence, setEvidence] = useState<Evidence>("keep");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [phase, setPhase] = useState<Phase | null>(null);
  const busy = phase !== null;

  function close() {
    if (busy) return;
    if (preview) URL.revokeObjectURL(preview);
    onClose();
  }

  function pick(next: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next ?? null);
    setPreview(next ? URL.createObjectURL(next) : null);
    if (next) setFileError(false);
  }

  function fail(key: string) {
    toast({
      title: t("resultCorrection.errors.title"),
      body: t(`resultCorrection.errors.${key}`),
      tone: "danger",
    });
  }

  /** The field-level errors, shown in place; true if any. */
  function fieldError(key: string): boolean {
    if (key === "timeInvalid") setTimeError(t("resultCorrection.errors.timeInvalid"));
    else if (key === "distanceInvalid") {
      setDistanceError(t("resultCorrection.errors.distanceInvalid"));
    } else if (key === "reasonRequired") {
      setReasonError(t("resultCorrection.errors.reasonRequired"));
    } else return false;
    focusFirstInvalid();
    return true;
  }

  async function save() {
    const timeOk = parseFinishTime(time) !== null;
    const distanceOk = !distance.trim() || parseDistanceRun(distance) !== null;
    const reasonOk = reason.trim() !== "";
    const fileOk = evidence !== "replace" || file !== null;
    setTimeError(timeOk ? undefined : t("resultCorrection.errors.timeInvalid"));
    setDistanceError(distanceOk ? undefined : t("resultCorrection.errors.distanceInvalid"));
    setReasonError(reasonOk ? undefined : t("resultCorrection.errors.reasonRequired"));
    setFileError(!fileOk);
    if (!timeOk || !distanceOk || !reasonOk || !fileOk) {
      focusFirstInvalid();
      return;
    }

    try {
      let newEvidencePath: string | undefined;
      if (evidence === "replace" && file) {
        setPhase("converting");
        const webp = await toWebp(file, { maxEdge: EVIDENCE_MAX_EDGE });
        if (webp.size > EVIDENCE_MAX_BYTES) return fail("imageTooLarge");

        setPhase("uploading");
        const signed = await prepareEvidenceUploadAction(result.id).catch(
          () => ({ ok: false, error: "uploadFailed" }) as const,
        );
        if (!signed.ok) return fail(signed.error);
        const { error } = await createClient()
          .storage.from(EVIDENCE_BUCKET)
          .uploadToSignedUrl(signed.path, signed.token, webp, { contentType: "image/webp" });
        if (error) return fail("uploadFailed");
        newEvidencePath = signed.path;
      }

      setPhase("saving");
      const saved = await correctRaceResultAction({
        resultId: result.id,
        version: result.version,
        finishTime: time,
        distanceRun: distance,
        evidence,
        newEvidencePath,
        reason,
      }).catch(() => ({ ok: false, error: "correctFailed" }) as const);

      if (!saved.ok) {
        if (!fieldError(saved.error)) fail(saved.error);
        // Refreshed underneath: the dialog no longer matches the result.
        if (saved.error === "alreadyChanged") onClose();
        return;
      }

      toast({
        title: t("resultCorrection.savedTitle"),
        body: t("resultCorrection.savedBody", { name: result.runnerName }),
      });
      if (preview) URL.revokeObjectURL(preview);
      onClose();
    } catch (e) {
      fail(e instanceof ImageConversionError ? e.code : "uploadFailed");
    } finally {
      setPhase(null);
    }
  }

  const options: Evidence[] = hasEvidence ? ["keep", "remove", "replace"] : ["keep", "replace"];

  return (
    <Modal
      open
      onClose={close}
      title={t("resultCorrection.title")}
      description={t("resultCorrection.description", {
        name: result.runnerName,
        event: result.eventName,
        distance: distanceLabel(t, result.distance),
      })}
      className="max-h-[100dvh] overflow-y-auto overscroll-contain"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={close}>
            {t("resultCorrection.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={busy} aria-busy={busy}>
            {phase ? t(`resultCorrection.phase.${phase}`) : t("resultCorrection.save")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* The screenshot ------------------------------------------------ */}
        <div className="flex flex-col">
          <p
            id={`${fileId}-label`}
            className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase"
          >
            {t("resultCorrection.evidence")}
          </p>

          {hasEvidence && result.evidenceUrl ? (
            <a
              href={result.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t("resultCorrection.currentEvidence")} ${t("common.opensInNewTab")}`}
              className={cn(
                "mt-2 block border-2 border-line hover:border-neon-lime",
                evidence !== "keep" && "opacity-40",
              )}
            >
              {/* A signed Storage URL; next/image would need the host configured. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.evidenceUrl}
                alt={t("resultCorrection.currentEvidence")}
                className="max-h-48 w-full bg-carbon object-contain"
              />
            </a>
          ) : (
            <p className="mt-2 text-[13px] text-fg-dim">
              {result.evidenceRemoved
                ? t("resultCorrection.evidenceRemoved")
                : result.recorded
                  ? t("resultCorrection.evidenceRecorded")
                  : t("resultCorrection.evidenceUnavailable")}
            </p>
          )}

          <RadioGroup
            aria-labelledby={`${fileId}-label`}
            className="mt-3 flex flex-wrap gap-2"
          >
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={evidence === option}
                disabled={busy}
                onClick={() => {
                  setEvidence(option);
                  setFileError(false);
                }}
                className={cn(
                  "border-2 px-4 py-2.5 text-[13px] font-bold",
                  evidence === option
                    ? "border-neon-lime bg-neon-lime text-ink"
                    : "border-line-strong text-fg-muted hover:border-fg-dim",
                )}
              >
                {t(
                  option === "keep" && !hasEvidence
                    ? "resultCorrection.keepNone"
                    : `resultCorrection.${option}`,
                )}
              </button>
            ))}
          </RadioGroup>

          {evidence === "remove" ? (
            <p className="mt-3 text-[13px] text-fg-dim">{t("resultCorrection.removeHint")}</p>
          ) : null}

          {evidence === "replace" ? (
            <>
              <label
                htmlFor={fileId}
                className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-line-strong bg-carbon p-3 text-center text-[13px] text-fg-dim hover:border-neon-lime has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon-yellow"
              >
                {preview ? (
                  // A local object URL of the picked file.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={file?.name ?? ""} className="max-h-48 object-contain" />
                ) : (
                  <span>{t("resultCorrection.choose")}</span>
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
                  {t("resultCorrection.errors.evidenceRequired")}
                </p>
              ) : null}
              <p className="mt-2 text-[12px] text-fg-dim">{t("resultCorrection.replaceHint")}</p>
            </>
          ) : null}
        </div>

        {/* Time and distance --------------------------------------------- */}
        <Field
          label={t("resultCorrection.finishTime")}
          hint={t("resultCorrection.finishTimeHint")}
          error={timeError}
        >
          {(p) => (
            <Input
              {...p}
              name="finish_time"
              value={time}
              disabled={busy}
              onChange={(e) => {
                setTime(e.target.value);
                if (timeError) setTimeError(undefined);
              }}
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

        <Field
          label={t("resultCorrection.distanceRun")}
          hint={t("resultCorrection.distanceRunHint", {
            distance: distanceLabel(t, result.distance),
          })}
          error={distanceError}
        >
          {(p) => (
            <Input
              {...p}
              name="distance_run"
              value={distance}
              disabled={busy}
              onChange={(e) => {
                setDistance(e.target.value);
                if (distanceError) setDistanceError(undefined);
              }}
              onBlur={() => {
                // Show how "10,01 km" was read.
                const km = parseDistanceRun(distance);
                if (km !== null) setDistance(String(km));
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="10.01"
              className="font-mono tabular-nums"
            />
          )}
        </Field>

        {/* Why ------------------------------------------------------------ */}
        <Field
          label={t("resultCorrection.reason")}
          hint={t("resultCorrection.reasonHint")}
          error={reasonError}
        >
          {(p) => (
            <Textarea
              {...p}
              name="reason"
              value={reason}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(undefined);
              }}
              maxLength={REVIEW_NOTE_MAX}
              className="min-h-20"
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

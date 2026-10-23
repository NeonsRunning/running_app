"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { distanceLabel } from "@/lib/i18n/labels";
import { reviewRaceResultAction } from "@/lib/results/actions";
import { REVIEW_NOTE_MAX, formatFinishTime } from "@/lib/results/evidence";
import type { ResultSubmissionRow } from "@/lib/results/queries";

/**
 * The organizer's queue of finish evidence for one event: each runner's
 * screenshot beside the time they claim. Accepting puts the result and the
 * event's medal on the runner's profile; rejecting sends it back with an
 * optional note, and the runner can try again. A reviewed card leaves the
 * queue at once.
 */
export function EventResults({ initial }: { initial: ResultSubmissionRow[] }) {
  const t = useT();
  const fmt = useFormat();
  const localeTag = useLocaleTag();
  // Puerto Rico time, fixed so the server and the browser render the same.
  const submitted = new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Puerto_Rico",
  });
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  // A re-sent submission arrives with the revalidated list.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRows(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function review(row: ResultSubmissionRow, accept: boolean) {
    setBusy(row.id);
    const result = await reviewRaceResultAction(
      row.id,
      accept,
      accept ? undefined : note,
    ).catch(() => ({ ok: false, error: "reviewFailed" }) as const);
    setBusy(null);

    if (result.ok || result.error === "alreadyReviewed") {
      setRows((all) => all.filter((r) => r.id !== row.id));
      setRejecting(null);
      setNote("");
    }
    toast(
      result.ok
        ? {
            title: t(accept ? "resultReview.acceptedTitle" : "resultReview.rejectedTitle"),
            body: t(accept ? "resultReview.acceptedBody" : "resultReview.rejectedBody", {
              name: row.runnerName,
            }),
          }
        : {
            title: t("resultReview.errors.title"),
            body: t(`resultReview.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  return (
    <section>
      <SectionHeading
        title={t("resultReview.title")}
        kicker={t("resultReview.count", { count: fmt.number(rows.length) })}
      />
      <p className="mt-5 max-w-3xl text-[15px] text-fg-dim">{t("resultReview.body")}</p>

      {rows.length === 0 ? (
        <p className="mt-6 border-2 border-line p-7 text-[15px] text-fg-dim">
          {t("resultReview.empty")}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col border-2 border-line sm:flex-row">
              <div className="shrink-0 border-b-2 border-line bg-carbon sm:w-56 sm:border-r-2 sm:border-b-0">
                {row.evidenceUrl ? (
                  <a
                    href={row.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full"
                    aria-label={t("resultReview.openEvidence", { name: row.runnerName })}
                  >
                    {/* A signed Storage URL; next/image would need the host configured. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.evidenceUrl}
                      alt={t("resultReview.evidenceAlt", { name: row.runnerName })}
                      loading="lazy"
                      className="h-64 w-full object-contain sm:h-full sm:max-h-80"
                    />
                  </a>
                ) : (
                  <p className="p-5 text-[13px] text-fg-dim">
                    {t("resultReview.evidenceMissing")}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="p-5">
                  <Eyebrow>
                    {distanceLabel(t, row.distance)}
                    {row.bib ? ` · ${t("resultReview.bib", { bib: row.bib })}` : ""}
                  </Eyebrow>
                  <p className="mt-2 text-xl font-extrabold break-words">{row.runnerName}</p>
                  <p className="mt-3 font-display text-4xl font-black text-neon-yellow tabular-nums">
                    {formatFinishTime(row.finishSeconds)}
                  </p>
                  <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                    {t("resultReview.submitted", {
                      date: submitted.format(new Date(row.submittedAt)),
                    })}
                  </p>
                </div>

                <div className="mt-auto border-t-2 border-line p-5">
                  {rejecting === row.id ? (
                    <div className="flex flex-col gap-3">
                      <Field
                        label={t("resultReview.note")}
                        hint={t("resultReview.noteHint")}
                        optional
                      >
                        {(p) => (
                          <Textarea
                            {...p}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={REVIEW_NOTE_MAX}
                            className="min-h-20"
                          />
                        )}
                      </Field>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="danger"
                          size="md"
                          disabled={busy !== null}
                          aria-busy={busy === row.id}
                          onClick={() => review(row, false)}
                        >
                          {busy === row.id ? t("resultReview.working") : t("resultReview.rejectYes")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          disabled={busy !== null}
                          onClick={() => {
                            setRejecting(null);
                            setNote("");
                          }}
                        >
                          {t("resultReview.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        size="md"
                        disabled={busy !== null}
                        aria-busy={busy === row.id}
                        onClick={() => review(row, true)}
                      >
                        {busy === row.id ? t("resultReview.working") : t("resultReview.accept")}
                      </Button>
                      <Button
                        variant="outline"
                        size="md"
                        disabled={busy !== null}
                        onClick={() => {
                          setRejecting(row.id);
                          setNote("");
                        }}
                      >
                        {t("resultReview.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

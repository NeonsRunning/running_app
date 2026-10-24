"use client";

import { useMemo, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { distanceLabel } from "@/lib/i18n/labels";
import {
  disqualifyRaceResultAction,
  reinstateRaceResultAction,
} from "@/lib/results/actions";
import { REVIEW_NOTE_MAX, formatFinishTime } from "@/lib/results/evidence";
import type { EventFinisherRow } from "@/lib/results/queries";

/**
 * The event's reviewed results, for the organizer and admins: accepted,
 * sent back, and disqualified. A runner caught cheating is disqualified
 * from here with a reason they see: the result and the medal leave their
 * profile, and they cannot send evidence again. Disqualified rows stay in
 * the list, with the reason; only a platform admin can reinstate one. A
 * sent-back result leaves the list when the runner sends new evidence.
 */
export function EventFinishers({
  initial,
  isAdmin,
}: {
  initial: EventFinisherRow[];
  isAdmin: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const localeTag = useLocaleTag();
  // Puerto Rico time, fixed so the server and the browser render the same.
  const when = new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Puerto_Rico",
  });
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  // A review accepted meanwhile arrives with the revalidated list.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRows(initial);
  }
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [disqualifying, setDisqualifying] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.bib} ${r.runnerName}`.toLowerCase().includes(q));
  }, [rows, query]);
  const disqualifiedCount = rows.filter((r) => r.status === "disqualified").length;
  const rejectedCount = rows.filter((r) => r.status === "rejected").length;

  function closeForm() {
    setDisqualifying(null);
    setReason("");
    setReasonError(undefined);
  }

  function fail(key: string) {
    toast({
      title: t("resultFinishers.errors.title"),
      body: t(`resultFinishers.errors.${key}`),
      tone: "danger",
    });
  }

  async function disqualify(row: EventFinisherRow) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(t("resultFinishers.errors.reasonRequired"));
      return;
    }
    setBusy(row.id);
    const result = await disqualifyRaceResultAction(row.id, trimmed).catch(
      () => ({ ok: false, error: "disqualifyFailed" }) as const,
    );
    setBusy(null);

    if (!result.ok) {
      if (result.error === "reasonRequired") {
        setReasonError(t("resultFinishers.errors.reasonRequired"));
        return;
      }
      return fail(result.error);
    }
    setRows((all) =>
      all.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status: "disqualified",
              disqualificationReason: trimmed,
              disqualifiedAt: new Date().toISOString(),
            }
          : r,
      ),
    );
    closeForm();
    toast({
      title: t("resultFinishers.disqualifiedTitle"),
      body: t("resultFinishers.disqualifiedBody", { name: row.runnerName }),
    });
  }

  async function reinstate(row: EventFinisherRow) {
    setBusy(row.id);
    const result = await reinstateRaceResultAction(row.id).catch(
      () => ({ ok: false, error: "reinstateFailed" }) as const,
    );
    setBusy(null);

    if (!result.ok) return fail(result.error);
    setRows((all) =>
      all.map((r) =>
        r.id === row.id
          ? { ...r, status: "accepted", disqualificationReason: null, disqualifiedAt: null }
          : r,
      ),
    );
    toast({
      title: t("resultFinishers.reinstatedTitle"),
      body: t("resultFinishers.reinstatedBody", { name: row.runnerName }),
    });
  }

  return (
    <section>
      <SectionHeading
        title={t("resultFinishers.title")}
        kicker={t("resultFinishers.count", {
          count: fmt.number(rows.length - disqualifiedCount - rejectedCount),
          rejected: fmt.number(rejectedCount),
          disqualified: fmt.number(disqualifiedCount),
        })}
      />
      <p className="mt-5 max-w-3xl text-[15px] text-fg-dim">{t("resultFinishers.body")}</p>

      {rows.length > 0 ? (
        <div className="mt-6 sm:w-80">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("resultFinishers.searchPlaceholder")}
            aria-label={t("resultFinishers.searchAria")}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 border-2 border-dashed border-line px-6 py-10 text-center text-[15px] text-fg-dim">
          {t("resultFinishers.empty")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-6 border-2 border-dashed border-line px-6 py-10 text-center text-[15px] text-fg-dim">
          {t("resultFinishers.noMatches")}
        </p>
      ) : (
        <ul className="mt-6 border-t-2 border-line">
          {shown.map((row) => (
            <li key={row.id} className="border-b-2 border-line py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Eyebrow>
                    {distanceLabel(t, row.distance)}
                    {row.bib ? ` · ${t("resultReview.bib", { bib: row.bib })}` : ""}
                  </Eyebrow>
                  <p className="mt-2 text-lg font-extrabold break-words">{row.runnerName}</p>
                  {row.status === "disqualified" ? (
                    <p className="mt-2 max-w-[60ch] text-[14px] text-fg-muted">
                      {t("resultFinishers.reasonShown", {
                        reason: row.disqualificationReason ?? "",
                        date: row.disqualifiedAt
                          ? when.format(new Date(row.disqualifiedAt))
                          : "",
                      })}
                    </p>
                  ) : null}
                  {row.status === "rejected" ? (
                    <p className="mt-2 max-w-[60ch] text-[14px] text-fg-muted">
                      {row.reviewNote
                        ? t("resultFinishers.reasonShown", {
                            reason: row.reviewNote,
                            date: row.reviewedAt ? when.format(new Date(row.reviewedAt)) : "",
                          })
                        : t("resultFinishers.rejectedNoNote", {
                            date: row.reviewedAt ? when.format(new Date(row.reviewedAt)) : "",
                          })}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={
                      row.status === "accepted"
                        ? "font-mono text-xl tabular-nums"
                        : "font-mono text-xl text-fg-faint tabular-nums line-through"
                    }
                  >
                    {formatFinishTime(row.finishSeconds)}
                  </span>
                  <Badge
                    tone={
                      row.status === "accepted"
                        ? "lime"
                        : row.status === "disqualified"
                          ? "danger"
                          : "outline"
                    }
                  >
                    {t(`resultFinishers.${row.status}`)}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {row.evidenceUrl ? (
                  <a
                    href={row.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-extrabold tracking-[0.12em] text-neon-lime uppercase hover:text-neon-yellow"
                    aria-label={t("resultReview.openEvidence", { name: row.runnerName })}
                  >
                    {t("resultFinishers.evidence")} ↗
                  </a>
                ) : (
                  <span className="text-[12px] text-fg-dim">
                    {t("resultReview.evidenceMissing")}
                  </span>
                )}

                {row.status === "accepted" && disqualifying !== row.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={t("resultFinishers.disqualifyAria", { name: row.runnerName })}
                    onClick={() => {
                      setDisqualifying(row.id);
                      setReason("");
                      setReasonError(undefined);
                    }}
                  >
                    {t("resultFinishers.disqualify")}
                  </Button>
                ) : null}

                {row.status === "disqualified" && isAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    aria-busy={busy === row.id}
                    aria-label={t("resultFinishers.reinstateAria", { name: row.runnerName })}
                    onClick={() => reinstate(row)}
                  >
                    {busy === row.id ? t("resultFinishers.working") : t("resultFinishers.reinstate")}
                  </Button>
                ) : null}
              </div>

              {disqualifying === row.id ? (
                <div className="mt-4 flex max-w-xl flex-col gap-3 border-2 border-danger/60 bg-danger/8 p-4">
                  <p className="text-[14px] text-fg-muted">
                    {t("resultFinishers.confirmBody", { name: row.runnerName })}
                  </p>
                  <Field
                    label={t("resultFinishers.reason")}
                    hint={t("resultFinishers.reasonHint")}
                    error={reasonError}
                  >
                    {(p) => (
                      <Textarea
                        {...p}
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          if (reasonError) setReasonError(undefined);
                        }}
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
                      onClick={() => disqualify(row)}
                    >
                      {busy === row.id
                        ? t("resultFinishers.working")
                        : t("resultFinishers.disqualifyYes")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={busy !== null}
                      onClick={closeForm}
                    >
                      {t("resultFinishers.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

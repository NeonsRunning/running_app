"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { reviewAthMovilPaymentAction } from "@/lib/ath-movil/review";
import type { AthMovilSubmissionRow } from "@/lib/ath-movil/queries";

/**
 * The admin's queue of ATH Móvil payments to find in the ATH Móvil Business
 * app. A reviewed row leaves the list at once; a failure puts it back.
 * Rejecting asks twice: it releases the runner's spot.
 */
export function AthMovilReview({
  initial,
}: {
  initial: AthMovilSubmissionRow[];
}) {
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
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);

  async function review(row: AthMovilSubmissionRow, approve: boolean) {
    setBusy(row.id);
    setConfirmingReject(null);
    const result = await reviewAthMovilPaymentAction(row.id, approve).catch(
      () => ({ ok: false, error: "reviewFailed" }) as const,
    );
    setBusy(null);

    if (result.ok || result.error === "alreadyReviewed") {
      setRows((all) => all.filter((r) => r.id !== row.id));
    }
    toast(
      result.ok
        ? {
            title: t(
              approve
                ? "adminPayments.approvedTitle"
                : "adminPayments.rejectedTitle",
            ),
            body: t(
              approve
                ? "adminPayments.approvedBody"
                : "adminPayments.rejectedBody",
              { name: row.runnerName },
            ),
          }
        : {
            title: t("adminPayments.errors.title"),
            body: t(`adminPayments.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  if (rows.length === 0) {
    return (
      <p className="border-2 border-line p-7 text-[15px] text-fg-dim">
        {t("adminPayments.empty")}
      </p>
    );
  }

  return (
    <ul className="grid gap-4">
      {rows.map((row) => (
        <li key={row.id} className="border-2 border-line">
          <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-line p-5 sm:p-6">
            <div className="min-w-0">
              <Eyebrow>
                {row.eventName} · {fmt.mediumDate(row.eventDate)}
              </Eyebrow>
              <p className="mt-2 text-xl font-extrabold break-words">
                {row.runnerName}
              </p>
              <p className="mt-1 text-[13px] break-all text-fg-dim">
                {row.email} · {row.phone}
              </p>
            </div>
            <p className="font-display text-3xl font-black text-neon-yellow tabular-nums">
              {fmt.money(row.amount)}
            </p>
          </div>

          <dl className="grid gap-px bg-line sm:grid-cols-3">
            {(
              [
                [t("adminPayments.reference"), row.reference],
                [t("adminPayments.code"), row.code],
                [
                  t("adminPayments.submitted"),
                  submitted.format(new Date(row.submittedAt)),
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-ink px-5 py-4 sm:px-6">
                <dt>
                  <Eyebrow>{label}</Eyebrow>
                </dt>
                <dd
                  translate="no"
                  className="mt-1 font-mono text-[15px] font-bold break-all tabular-nums"
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3 border-t-2 border-line p-5 sm:p-6">
            {confirmingReject === row.id ? (
              <>
                <p className="mr-auto text-[14px] text-fg-muted">
                  {t("adminPayments.rejectConfirm")}
                </p>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setConfirmingReject(null)}
                >
                  {t("adminPayments.cancel")}
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  disabled={busy !== null}
                  onClick={() => review(row, false)}
                >
                  {t("adminPayments.rejectYes")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={busy !== null}
                  aria-busy={busy === row.id}
                  onClick={() => review(row, true)}
                >
                  {busy === row.id
                    ? t("adminPayments.working")
                    : t("adminPayments.approve")}
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  disabled={busy !== null}
                  onClick={() => setConfirmingReject(row.id)}
                >
                  {t("adminPayments.reject")}
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

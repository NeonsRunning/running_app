"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pagination, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { distanceLabel } from "@/lib/i18n/labels";
import { reviewAthMovilPaymentAction } from "@/lib/ath-movil/review";
import type { EventPaymentRow } from "@/lib/ath-movil/queries";
import { PAYMENT_REVIEW_ANCHOR } from "@/lib/events/check-in-station";

const COLUMN_KEYS = [
  "eventPayments.columns.runner",
  "eventPayments.columns.distance",
  "eventPayments.columns.amount",
  "eventPayments.columns.reference",
  "eventPayments.columns.code",
  "eventPayments.columns.submitted",
  "eventPayments.columns.actions",
];

const PAGE_SIZE = 10;

/**
 * The organizer's ATH Móvil payments still waiting for confirmation on one
 * event. Card payments never show up here: Stripe confirms them on its own.
 * A reviewed row leaves the table at once; rejecting asks twice, since it
 * releases the runner's spot.
 */
export function EventPayments({
  initial,
  categories,
}: {
  initial: EventPaymentRow[];
  /** Category id → its distance name, for the Distance column. */
  categories: Record<string, string>;
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
  // A registration put back to pending arrives with the revalidated list.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRows(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Clamped, so reviewing the last row on the last page steps back a page.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * PAGE_SIZE;
  const visible = rows.slice(from, from + PAGE_SIZE);

  function goTo(next: number) {
    setPage(next);
    setConfirmingReject(null);
    tableRef.current?.scrollTo({ top: 0 });
    listRef.current?.scrollTo({ top: 0 });
  }

  async function review(row: EventPaymentRow, approve: boolean) {
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
                ? "eventPayments.confirmedTitle"
                : "eventPayments.rejectedTitle",
            ),
            body: t(
              approve
                ? "eventPayments.confirmedBody"
                : "eventPayments.rejectedBody",
              { name: row.runnerName },
            ),
          }
        : {
            title: t("eventPayments.errors.title"),
            body: t(`eventPayments.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  function distance(row: EventPaymentRow) {
    const name = categories[row.categoryId];
    return name ? distanceLabel(t, name) : "—";
  }

  function actions(row: EventPaymentRow) {
    // The money went into an ATH Móvil account the organizer does not hold:
    // a platform admin, who can see it, reviews it.
    if (!row.canReview) {
      return (
        <span className="text-[13px] text-fg-muted">
          {t("eventPayments.adminReviews")}
        </span>
      );
    }
    if (confirmingReject === row.id) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-muted">
            {t("eventPayments.rejectConfirm")}
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={busy !== null}
            onClick={() => review(row, false)}
          >
            {t("eventPayments.rejectYes")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingReject(null)}
          >
            {t("eventPayments.cancel")}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          aria-busy={busy === row.id}
          onClick={() => review(row, true)}
        >
          {busy === row.id
            ? t("eventPayments.working")
            : t("eventPayments.confirm")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => setConfirmingReject(row.id)}
        >
          {t("eventPayments.reject")}
        </Button>
      </div>
    );
  }

  return (
    // The check-in station links here for a runner whose payment is waiting.
    <section
      id={PAYMENT_REVIEW_ANCHOR}
      aria-label={t("eventPayments.title")}
      className="scroll-mt-24"
    >
      <SectionHeading
        title={t("eventPayments.title")}
        kicker={t("eventPayments.count", { count: rows.length })}
      />
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-fg-dim">
        {t("eventPayments.body")}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 border-2 border-dashed border-line px-6 py-10 text-center text-[15px] text-fg-dim">
          {t("eventPayments.empty")}
        </p>
      ) : (
        <div className="mt-6 border-2 border-line">
          {/* Table on wide screens. */}
          <div
            ref={tableRef}
            className="hidden max-h-[34rem] overflow-auto md:block"
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-ink shadow-[0_2px_0_var(--color-line)]">
                  {COLUMN_KEYS.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className="px-4 py-3 text-left font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
                    >
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b-2 border-line align-top last:border-b-0"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-bold break-words">
                        {row.runnerName}
                      </p>
                      <p className="text-[11px] break-all text-fg-faint">
                        {row.email} · {row.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-sm">{distance(row)}</td>
                    <td className="px-4 py-3.5 font-mono text-sm font-bold text-neon-yellow tabular-nums">
                      {fmt.money(row.amount)}
                    </td>
                    <td
                      translate="no"
                      className="px-4 py-3.5 font-mono text-sm break-all tabular-nums"
                    >
                      {row.reference}
                      {/* Which business app to look in, should the event
                          have switched accounts since. */}
                      {row.accountPath ? (
                        <span className="mt-0.5 block text-[11px] text-fg-faint">
                          {t("eventPayments.sentTo", { path: row.accountPath })}
                        </span>
                      ) : null}
                    </td>
                    <td
                      translate="no"
                      className="px-4 py-3.5 font-mono text-sm whitespace-nowrap"
                    >
                      {row.code}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap text-fg-dim">
                      {submitted.format(new Date(row.submittedAt))}
                    </td>
                    <td className="px-4 py-3.5">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards on phones — seven columns cannot shrink honestly. */}
          <ul ref={listRef} className="max-h-[34rem] overflow-y-auto md:hidden">
            {visible.map((row) => (
              <li
                key={row.id}
                className="border-b-2 border-line px-4 py-4 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-bold break-words">
                      {row.runnerName}
                    </p>
                    <p className="mt-0.5 text-[12px] break-all text-fg-dim">
                      {row.email} · {row.phone}
                    </p>
                  </div>
                  <span className="font-mono text-base font-bold text-neon-yellow tabular-nums">
                    {fmt.money(row.amount)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12px]">
                  {(
                    [
                      ["eventPayments.columns.distance", distance(row)],
                      ["eventPayments.columns.reference", row.reference],
                      ["eventPayments.columns.code", row.code],
                      ["eventPayments.columns.account", row.accountPath || "—"],
                      [
                        "eventPayments.columns.submitted",
                        submitted.format(new Date(row.submittedAt)),
                      ],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                        {t(key)}
                      </dt>
                      <dd translate="no" className="break-all">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4">{actions(row)}</div>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <div className="flex flex-col gap-3 border-t-2 border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-xs text-fg-dim tabular-nums">
                {t("common.pageRange", {
                  from: fmt.number(from + 1),
                  to: fmt.number(from + visible.length),
                  total: fmt.number(rows.length),
                })}
              </p>
              <Pagination page={current} pageCount={pageCount} onChange={goTo} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

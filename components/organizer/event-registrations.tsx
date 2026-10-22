"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Pagination, SectionHeading } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { distanceLabel, genderLabel } from "@/lib/i18n/labels";
import type { EventRegistrationRow } from "@/lib/events/organizer";
import { removeRegistrationAction } from "@/lib/events/remove-registration";

/** One list drives the table header and the CSV export, so they cannot drift. */
const COLUMN_KEYS = [
  "eventRegistrations.columns.bib",
  "eventRegistrations.columns.runner",
  "eventRegistrations.columns.distance",
  "eventRegistrations.columns.gender",
  "eventRegistrations.columns.age",
  "eventRegistrations.columns.shirt",
  "eventRegistrations.columns.method",
  "eventRegistrations.columns.amount",
  "eventRegistrations.columns.paid",
];

const PAGE_SIZE = 10;

/**
 * The organizer's completed registrations on one event: every paid sign-up,
 * bib assigned, in bib order. Rows come straight from the server render, so a
 * payment confirmed above joins the list on the revalidation that follows.
 * Removing a runner asks first, then drops the row at once rather than waiting
 * for that revalidation.
 */
export function EventRegistrations({
  rows: initial,
  categories,
  slug,
}: {
  rows: EventRegistrationRow[];
  /** Category id → its distance name, for the Distance column. */
  categories: Record<string, string>;
  /** Names the CSV file. */
  slug: string;
}) {
  const t = useT();
  const fmt = useFormat();
  const localeTag = useLocaleTag();
  // Puerto Rico time, fixed so the server and the browser render the same.
  const paidOn = new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeZone: "America/Puerto_Rico",
  });
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<EventRegistrationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Ids stay in `removed` after the revalidated rows arrive without them;
  // filtering them again costs nothing.
  const rows = useMemo(
    () => initial.filter((r) => !removed.has(r.id)),
    [initial, removed],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.bib ?? ""} ${r.runnerName} ${r.email} ${r.phone} ${r.club ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  // Clamped, so a shorter list after a search or a revalidation never strands
  // the table on a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * PAGE_SIZE;
  const visible = shown.slice(from, from + PAGE_SIZE);

  function goTo(next: number) {
    setPage(next);
    tableRef.current?.scrollTo({ top: 0 });
    listRef.current?.scrollTo({ top: 0 });
  }

  function distance(row: EventRegistrationRow) {
    const name = categories[row.categoryId];
    return name ? distanceLabel(t, name) : "—";
  }

  function method(row: EventRegistrationRow) {
    if (row.paymentMethod === "ath_movil") return t("eventRegistrations.athMovil");
    if (row.paymentMethod === "stripe") return t("eventRegistrations.card");
    return "—";
  }

  async function remove(row: EventRegistrationRow) {
    setBusy(row.id);
    const result = await removeRegistrationAction(row.id).catch(
      () => ({ ok: false, error: "removeFailed" }) as const,
    );
    setBusy(null);

    if (result.ok || result.error === "alreadyRemoved") {
      setRemoved((ids) => new Set(ids).add(row.id));
    }
    toast(
      result.ok
        ? {
            title: t("eventRegistrations.removedTitle"),
            body: t("eventRegistrations.removedBody", { name: row.runnerName }),
          }
        : {
            title: t("eventRegistrations.errors.title"),
            body: t(`eventRegistrations.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  function removeButton(row: EventRegistrationRow) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        aria-busy={busy === row.id}
        aria-label={t("eventRegistrations.removeAria", { name: row.runnerName })}
        onClick={() => setConfirming(row)}
        className="hover:border-danger hover:text-danger"
      >
        {busy === row.id
          ? t("eventRegistrations.removing")
          : t("eventRegistrations.remove")}
      </Button>
    );
  }

  function exportCsv() {
    // Contact details go in the file, where the table folds them under the name.
    const header = [
      ...COLUMN_KEYS.map((key) => t(key)),
      t("eventRegistrations.columns.email"),
      t("eventRegistrations.columns.phone"),
      t("eventRegistrations.columns.club"),
    ];
    const body = shown.map((r) => [
      r.bib ?? "",
      r.runnerName,
      distance(r),
      genderLabel(t, r.gender),
      r.age,
      r.shirtSize ?? "",
      method(r),
      r.amount.toFixed(2),
      r.paidAt.slice(0, 10),
      r.email,
      r.phone,
      r.club ?? "",
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    // A BOM, so Excel opens accented names as UTF-8.
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section id="registrations" aria-label={t("eventRegistrations.title")}>
      <SectionHeading
        title={t("eventRegistrations.title")}
        kicker={t("eventRegistrations.count", { count: fmt.number(rows.length) })}
      />

      {rows.length === 0 ? (
        <p className="mt-6 border-2 border-dashed border-line px-6 py-10 text-center text-[15px] text-fg-dim">
          {t("eventRegistrations.empty")}
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:w-80">
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t("eventRegistrations.searchPlaceholder")}
                aria-label={t("eventRegistrations.searchAria")}
              />
            </div>
            <Button variant="outline" size="md" onClick={exportCsv}>
              {t("eventRegistrations.exportCsv")}
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="mt-4 border-2 border-dashed border-line px-6 py-10 text-center text-[15px] text-fg-dim">
              {t("eventRegistrations.noMatches")}
            </p>
          ) : (
            <div className="mt-4 border-2 border-line">
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
                      <th scope="col" className="px-4 py-3">
                        <span className="sr-only">
                          {t("eventRegistrations.columns.actions")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b-2 border-line align-top last:border-b-0"
                      >
                        <td className="px-4 py-3.5 font-mono text-sm font-bold text-neon-lime tabular-nums">
                          {row.bib ?? "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-bold break-words">
                            {row.runnerName}
                          </p>
                          <p className="text-[11px] break-all text-fg-faint">
                            {row.email} · {row.phone}
                          </p>
                          {row.club ? (
                            <p className="text-[11px] text-fg-faint">{row.club}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-sm">{distance(row)}</td>
                        <td className="px-4 py-3.5 text-sm">
                          {genderLabel(t, row.gender)}
                        </td>
                        <td className="px-4 py-3.5 text-sm tabular-nums">{row.age}</td>
                        <td className="px-4 py-3.5 text-sm">{row.shirtSize ?? "—"}</td>
                        <td className="px-4 py-3.5 text-sm">{method(row)}</td>
                        <td className="px-4 py-3.5 font-mono text-sm tabular-nums">
                          {fmt.money(row.amount)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap text-fg-dim">
                          {paidOn.format(new Date(row.paidAt))}
                        </td>
                        <td className="px-4 py-3 text-right">{removeButton(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards on phones — nine columns cannot shrink honestly. */}
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
                      <span className="font-mono text-base font-bold text-neon-lime tabular-nums">
                        #{row.bib ?? "—"}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-[12px] text-fg-dim">
                      {[
                        distance(row),
                        genderLabel(t, row.gender),
                        row.age,
                        row.shirtSize,
                        method(row),
                        fmt.money(row.amount),
                        paidOn.format(new Date(row.paidAt)),
                      ]
                        .filter((v) => v !== null && v !== "")
                        .join(" · ")}
                    </p>
                    <div className="mt-3">{removeButton(row)}</div>
                  </li>
                ))}
              </ul>

              {pageCount > 1 ? (
                <div className="flex flex-col gap-3 border-t-2 border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-xs text-fg-dim tabular-nums">
                    {t("common.pageRange", {
                      from: fmt.number(from + 1),
                      to: fmt.number(from + visible.length),
                      total: fmt.number(shown.length),
                    })}
                  </p>
                  <Pagination page={current} pageCount={pageCount} onChange={goTo} />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) void remove(confirming);
        }}
        title={t("eventRegistrations.removeTitle", {
          name: confirming?.runnerName ?? "",
        })}
        description={t("eventRegistrations.removeDescription", {
          bib: confirming?.bib ?? "—",
        })}
        confirmLabel={t("eventRegistrations.remove")}
        destructive
      />
    </section>
  );
}

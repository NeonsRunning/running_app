"use client";

import { useMemo, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, SegmentedControl } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import { distanceLabel, genderLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { Participant } from "@/lib/types";

/**
 * The organizer's participant roster: search, a payment filter, bulk selection,
 * inline check-in toggles and a CSV export. `initial` seeds the list and every
 * edit is state-only, so changes last as long as the session does.
 */
type PayFilter = "all" | "paid" | "unpaid";

/** One list drives the table header and the CSV export, so they cannot drift. */
const COLUMN_KEYS = [
  "participants.columns.bib",
  "participants.columns.runner",
  "participants.columns.age",
  "participants.columns.gender",
  "participants.columns.distance",
  "participants.columns.shirt",
  "participants.columns.registered",
  "participants.columns.payment",
  "participants.columns.checkin",
];

export function ParticipantTable({ initial }: { initial: Participant[] }) {
  const [people, setPeople] = useState(initial);
  const [query, setQuery] = useState("");
  const [pay, setPay] = useState<PayFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !`${p.name} ${p.bib} ${p.email}`.toLowerCase().includes(q))
        return false;
      if (pay === "paid" && !p.paid) return false;
      if (pay === "unpaid" && p.paid) return false;
      return true;
    });
  }, [people, query, pay]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.bib));

  function toggleRow(bib: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bib)) next.delete(bib);
      else next.add(bib);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.bib)));
  }

  function toggleCheckIn(bib: string) {
    setPeople((prev) =>
      prev.map((p) => (p.bib === bib ? { ...p, checkedIn: !p.checkedIn } : p)),
    );
  }

  function exportCsv() {
    // The export follows the reader's language, headers and values alike.
    const header = COLUMN_KEYS.map((key) => t(key));
    const body = rows.map((p) => [
      p.bib,
      p.name,
      p.age,
      p.gender,
      p.distance,
      p.shirt,
      p.registeredOn,
      p.paid ? t("participants.csv.paid") : t("participants.csv.unpaid"),
      p.checkedIn ? t("participants.csv.yes") : t("participants.csv.no"),
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neon-night-10k-participants.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: t("participants.exportTitle"),
      body: t("participants.exportBody", { count: fmt.number(rows.length) }),
    });
  }

  const checkedInCount = people.filter((p) => p.checkedIn).length;

  return (
    <div>
      {/* Toolbar --------------------------------------------------------- */}
      <div className="flex flex-col gap-4 border-y-2 border-line px-4 py-5 sm:px-6 xl:flex-row xl:items-center">
        <div className="xl:w-80">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("participants.searchPlaceholder")}
            aria-label={t("participants.searchAria")}
          />
        </div>
        <SegmentedControl
          label={t("participants.paymentStatus")}
          value={pay}
          onChange={setPay}
          options={[
            { value: "all", label: t("participants.all") },
            { value: "paid", label: t("participants.paid") },
            { value: "unpaid", label: t("participants.unpaid") },
          ]}
          className="sm:w-72"
        />
        <div className="flex-1" />
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() =>
              toast({
                title: t("participants.emailQueuedTitle"),
                body: t("participants.emailQueuedBody", {
                  count: fmt.number(selected.size || rows.length),
                }),
              })
            }
          >
            {t("participants.sendEmail")}
          </Button>
          <Button variant="outline" size="md" onClick={exportCsv}>
            {t("participants.exportCsv")}
          </Button>
          <Button size="md" onClick={() => setAddOpen(true)}>
            {t("participants.manualRegistration")}
          </Button>
        </div>
      </div>

      {/* Summary --------------------------------------------------------- */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b-2 border-line px-4 py-3.5 font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase sm:px-6">
        <span>
          <b className="text-fg">{fmt.number(rows.length)}</b>{" "}
          {t("participants.shown")}
        </span>
        <span>
          <b className="text-neon-lime">{fmt.number(checkedInCount)}</b>{" "}
          {t("participants.checkedIn")}
        </span>
        <span>
          <b className="text-neon-yellow">
            {fmt.number(people.filter((p) => !p.paid).length)}
          </b>{" "}
          {t("participants.unpaidCount")}
        </span>
        {selected.size > 0 ? (
          <span className="text-neon-lime">
            {t("participants.selected", { count: fmt.number(selected.size) })}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon="👥"
            title={t("participants.emptyTitle")}
            body={t("participants.emptyBody")}
          />
        </div>
      ) : (
        <>
          {/* Table on wide screens. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-line">
                  <th scope="col" className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label={t("participants.selectAll")}
                      className="h-4 w-4 accent-[#9CFF00]"
                    />
                  </th>
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
                {rows.map((p) => (
                  <tr
                    key={p.bib}
                    className={cn(
                      "border-b-2 border-line transition-colors hover:bg-carbon",
                      selected.has(p.bib) && "bg-neon-lime/5",
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(p.bib)}
                        onChange={() => toggleRow(p.bib)}
                        aria-label={t("participants.selectOne", {
                          name: p.name,
                        })}
                        className="h-4 w-4 accent-[#9CFF00]"
                      />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-sm tabular-nums">
                      {p.bib}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 items-center justify-center bg-graphite text-[10px] font-black text-fg-dim"
                        >
                          {p.initials}
                        </span>
                        <div>
                          <p className="text-sm font-bold">{p.name}</p>
                          <p className="text-[11px] text-fg-faint">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums">{p.age}</td>
                    <td className="px-4 py-3.5 text-sm">
                      {genderLabel(t, p.gender)}
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      {distanceLabel(t, p.distance)}
                    </td>
                    <td className="px-4 py-3.5 text-sm">{p.shirt}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-fg-dim">
                      {p.registeredOn}
                    </td>
                    <td className="px-4 py-3.5">
                      {p.paid ? (
                        <Badge tone="green">{t("participants.paid")}</Badge>
                      ) : (
                        <Badge tone="danger">{t("participants.unpaid")}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => toggleCheckIn(p.bib)}
                        aria-pressed={p.checkedIn}
                        className={cn(
                          "border-2 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-colors",
                          p.checkedIn
                            ? "border-neon-lime bg-neon-lime text-ink"
                            : "border-line-strong text-fg-dim hover:border-fg-dim hover:text-fg",
                        )}
                      >
                        {p.checkedIn
                          ? t("participants.in")
                          : t("participants.checkIn")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below lg — a nine-column table cannot shrink honestly. */}
          <ul className="lg:hidden">
            {rows.map((p) => (
              <li key={p.bib} className="border-b-2 border-line px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-bold">{p.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-fg-dim">
                      {t("participants.cardMeta", {
                        bib: p.bib,
                        distance: distanceLabel(t, p.distance),
                        age: p.age,
                        gender: genderLabel(t, p.gender),
                        shirt: p.shirt,
                      })}
                    </p>
                  </div>
                  {p.paid ? (
                    <Badge tone="green">{t("participants.paid")}</Badge>
                  ) : (
                    <Badge tone="danger">{t("participants.unpaid")}</Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleCheckIn(p.bib)}
                  aria-pressed={p.checkedIn}
                  className={cn(
                    "mt-3.5 min-h-11 w-full border-2 px-3 py-2 text-xs font-bold tracking-wider uppercase",
                    p.checkedIn
                      ? "border-neon-lime bg-neon-lime text-ink"
                      : "border-line-strong text-fg-dim",
                  )}
                >
                  {p.checkedIn
                    ? t("participants.checkedInLong")
                    : t("participants.checkIn")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Manual registration -------------------------------------------- */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("participants.manualRegistration")}
        description={t("participants.modalDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setAddOpen(false);
                toast({
                  title: t("participants.runnerAddedTitle"),
                  body: t("participants.runnerAddedBody"),
                });
              }}
            >
              {t("participants.addRunner")}
            </Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("participants.fullName")}>
            {(p) => (
              <Input {...p} placeholder={t("participants.namePlaceholder")} />
            )}
          </Field>
          <Field label={t("participants.email")}>
            {(p) => <Input {...p} type="email" placeholder="runner@email.com" />}
          </Field>
          <Field label={t("participants.distance")}>
            {(p) => <Input {...p} defaultValue="10K" />}
          </Field>
          <Field label={t("participants.shirtSize")}>
            {(p) => <Input {...p} defaultValue="M" />}
          </Field>
        </div>
        <p className="mt-5 text-[13px] text-fg-dim">
          <Eyebrow className="mb-1">{t("participants.nextBib")}</Eyebrow>
          {t("participants.nextBibNote")}
        </p>
      </Modal>
    </div>
  );
}

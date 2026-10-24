"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Pagination, SectionHeading } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { toCsv } from "@/lib/csv";
import { puertoRicoDate } from "@/lib/dates";
import { distanceLabel, genderLabel } from "@/lib/i18n/labels";
import type { EventRegistrationRow } from "@/lib/events/organizer";
import {
  removeRegistrationAction,
  returnRegistrationToPendingAction,
} from "@/lib/events/remove-registration";
import { markKitShippedAction } from "@/lib/events/ship-kit";
import { markMedalPickedUpAction, markMedalShippedAction } from "@/lib/events/ship-medal";
import { cn } from "@/lib/cn";
import { MAX_TRACKING_LENGTH } from "@/lib/events/vocabulary";

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

type Parcel = "kit" | "medal";

/** The shipping copy for each, spelled out so every key stays findable. */
const SHIP_COPY = {
  kit: {
    markShipped: "eventRegistrations.markShipped",
    markShippedAria: "eventRegistrations.markShippedAria",
    editTrackingAria: "eventRegistrations.editTrackingAria",
    shippedOn: "eventRegistrations.shippedOn",
    shipTitle: "eventRegistrations.shipTitle",
    shipDescription: "eventRegistrations.shipDescription",
    trackingTitle: "eventRegistrations.trackingTitle",
    trackingDescription: "eventRegistrations.trackingDescription",
    shippedTitle: "eventRegistrations.shippedTitle",
    shippedBody: "eventRegistrations.shippedBody",
    trackingSavedTitle: "eventRegistrations.trackingSavedTitle",
    trackingSavedBody: "eventRegistrations.trackingSavedBody",
  },
  medal: {
    markShipped: "eventRegistrations.medal.markShipped",
    markShippedAria: "eventRegistrations.medal.markShippedAria",
    editTrackingAria: "eventRegistrations.medal.editTrackingAria",
    shippedOn: "eventRegistrations.medal.shippedOn",
    shipTitle: "eventRegistrations.medal.shipTitle",
    shipDescription: "eventRegistrations.medal.shipDescription",
    trackingTitle: "eventRegistrations.medal.trackingTitle",
    trackingDescription: "eventRegistrations.medal.trackingDescription",
    shippedTitle: "eventRegistrations.medal.shippedTitle",
    shippedBody: "eventRegistrations.medal.shippedBody",
    trackingSavedTitle: "eventRegistrations.medal.trackingSavedTitle",
    trackingSavedBody: "eventRegistrations.medal.trackingSavedBody",
  },
} as const;

/** The address, and whether it has shipped, of a row's kit or medal. */
function parcelOf(row: EventRegistrationRow, kind: Parcel) {
  return kind === "kit"
    ? {
        address: row.mailingAddress,
        shippedAt: row.shippedAt,
        tracking: row.shippingTracking,
      }
    : {
        address: row.medal?.byMail ? row.medal.address : null,
        shippedAt: row.medal?.shippedAt ?? null,
        tracking: row.medal?.tracking ?? null,
      };
}

/** A finisher whose medal is ready to go out by mail. */
const medalToMail = (row: EventRegistrationRow) =>
  Boolean(
    row.medal?.byMail && row.medal.finished && row.medal.address && !row.medal.shippedAt,
  );

/**
 * The organizer's completed registrations on one event: every paid sign-up,
 * bib assigned, in bib order. Rows come straight from the server render, so a
 * payment confirmed above joins the list on the revalidation that follows.
 * Removing a runner — or putting an ATH Móvil sign-up back to pending — asks
 * first, then drops the row at once rather than waiting for that revalidation.
 * A mailed kit is marked shipped the same way, which emails the runner; its
 * tracking number can be changed afterwards without emailing again. On races
 * that mail medals, so is each finisher's medal, and "Medals to mail" narrows
 * the list to the ones ready to go out.
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
  const [reverting, setReverting] = useState<EventRegistrationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shipping, setShipping] = useState<{
    row: EventRegistrationRow;
    kind: Parcel;
  } | null>(null);
  const [tracking, setTracking] = useState("");
  const [onlyMedalsToMail, setOnlyMedalsToMail] = useState(false);
  // Shipped here, ahead of the revalidation that brings it back from the
  // server. Keyed `kit:<id>` or `medal:<id>`.
  const [shipped, setShipped] = useState<
    ReadonlyMap<string, { shippedAt: string; tracking: string | null }>
  >(new Map());
  // Medals handed over here, by registration id, likewise.
  const [pickedUp, setPickedUp] = useState<ReadonlyMap<string, string>>(new Map());
  const [handingOut, setHandingOut] = useState<EventRegistrationRow | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Revalidated rows already leave out what was dropped here, so `removed`
  // starts over with them — a sign-up put back to pending and approved again
  // must be able to return.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRemoved(new Set());
    setShipped(new Map());
    setPickedUp(new Map());
  }

  const rows = useMemo(
    () =>
      initial
        .filter((r) => !removed.has(r.id))
        .map((r) => {
          const kit = shipped.get(`kit:${r.id}`);
          const medal = shipped.get(`medal:${r.id}`);
          const handedOver = pickedUp.get(r.id);
          return {
            ...r,
            ...(kit ? { shippedAt: kit.shippedAt, shippingTracking: kit.tracking } : {}),
            ...((medal || handedOver) && r.medal
              ? {
                  medal: {
                    ...r.medal,
                    ...(medal ? { shippedAt: medal.shippedAt, tracking: medal.tracking } : {}),
                    ...(handedOver ? { pickedUpAt: handedOver } : {}),
                  },
                }
              : {}),
          };
        }),
    [initial, removed, shipped, pickedUp],
  );

  // Whether this race mails medals, or did when some went out.
  const hasMedals = rows.some((r) => r.medal !== null);
  const medalsToMail = rows.filter(medalToMail).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const listed = onlyMedalsToMail ? rows.filter(medalToMail) : rows;
    if (!q) return listed;
    return listed.filter((r) =>
      `${r.bib ?? ""} ${r.runnerName} ${r.email} ${r.phone} ${r.club ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query, onlyMedalsToMail]);

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

  async function revert(row: EventRegistrationRow) {
    setBusy(row.id);
    const result = await returnRegistrationToPendingAction(row.id).catch(
      () => ({ ok: false, error: "revertFailed" }) as const,
    );
    setBusy(null);

    if (result.ok || result.error === "alreadyChanged") {
      setRemoved((ids) => new Set(ids).add(row.id));
    }
    toast(
      result.ok
        ? {
            title: t("eventRegistrations.pendingTitle"),
            body: t("eventRegistrations.pendingBody", { name: row.runnerName }),
          }
        : {
            title: t("eventRegistrations.pendingErrors.title"),
            body: t(`eventRegistrations.pendingErrors.${result.error}`),
            tone: "danger",
          },
    );
  }

  function openShipping(row: EventRegistrationRow, kind: Parcel) {
    setTracking(parcelOf(row, kind).tracking ?? "");
    setShipping({ row, kind });
  }

  async function ship(row: EventRegistrationRow, kind: Parcel) {
    setBusy(row.id);
    const mark = kind === "kit" ? markKitShippedAction : markMedalShippedAction;
    const result = await mark(row.id, tracking).catch(
      () => ({ ok: false, error: "shipFailed" }) as const,
    );
    setBusy(null);

    if (result.ok) {
      setShipped((m) =>
        new Map(m).set(`${kind}:${row.id}`, {
          shippedAt: result.shippedAt,
          tracking: result.tracking,
        }),
      );
      setShipping(null);
    }
    // Marking it again only changes the tracking number.
    const again = Boolean(parcelOf(row, kind).shippedAt);
    const copy = SHIP_COPY[kind];
    toast(
      result.ok
        ? {
            title: t(again ? copy.trackingSavedTitle : copy.shippedTitle),
            body: t(again ? copy.trackingSavedBody : copy.shippedBody, {
              name: row.runnerName,
            }),
          }
        : {
            title: t("eventRegistrations.shipErrors.title"),
            body: t(`eventRegistrations.shipErrors.${result.error}`),
            tone: "danger",
          },
    );
  }

  /** Whether a mailed kit or medal has shipped, and the button to say so. */
  function shippingControl(row: EventRegistrationRow, kind: Parcel) {
    const parcel = parcelOf(row, kind);
    const copy = SHIP_COPY[kind];

    if (kind === "kit" && !parcel.address) return null;
    if (kind === "medal") {
      if (!row.medal) return null;
      if (!row.medal.shippedAt && !row.medal.byMail) return pickupControl(row, row.medal);
      // Not finished, or no address: nothing to mail yet, so no button.
      const waiting = row.medal.shippedAt
        ? null
        : !row.medal.finished
          ? "eventRegistrations.medal.notFinished"
          : !row.medal.address
            ? "eventRegistrations.medal.noAddress"
            : null;
      if (waiting) {
        return (
          <p className="font-mono text-[11px] tracking-[0.08em] text-fg-dim uppercase md:text-right">
            {t(waiting)}
          </p>
        );
      }
    }

    return (
      <div className="flex flex-col gap-1.5 md:items-end">
        {parcel.shippedAt ? (
          <p className="font-mono text-[11px] tracking-[0.08em] text-neon-lime uppercase md:text-right">
            {t(copy.shippedOn, {
              date: paidOn.format(new Date(parcel.shippedAt)),
            })}
            {parcel.tracking ? (
              <span className="block break-all text-fg-dim normal-case">
                {t("eventRegistrations.trackingValue", {
                  tracking: parcel.tracking,
                })}
              </span>
            ) : null}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label={t(
            parcel.shippedAt ? copy.editTrackingAria : copy.markShippedAria,
            { name: row.runnerName },
          )}
          onClick={() => openShipping(row, kind)}
        >
          {t(
            parcel.shippedAt
              ? parcel.tracking
                ? "eventRegistrations.editTracking"
                : "eventRegistrations.addTracking"
              : copy.markShipped,
          )}
        </Button>
      </div>
    );
  }

  /** A medal picked up in person: when it was, or the button to say so. */
  function pickupControl(row: EventRegistrationRow, medal: NonNullable<EventRegistrationRow["medal"]>) {
    const note = (key: string, date?: string) => (
      <p
        className={cn(
          "font-mono text-[11px] tracking-[0.08em] uppercase md:text-right",
          date ? "text-neon-lime" : "text-fg-dim",
        )}
      >
        {t(key, date ? { date } : undefined)}
      </p>
    );

    if (medal.pickedUpAt) {
      return note("eventRegistrations.medal.pickedUpOn", paidOn.format(new Date(medal.pickedUpAt)));
    }
    if (!medal.canHandOut) return note("eventRegistrations.medal.pickupNotYet");
    return (
      <div className="flex flex-col gap-1.5 md:items-end">
        {note("eventRegistrations.medal.pickupChosen")}
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label={t("eventRegistrations.medal.markPickedUpAria", { name: row.runnerName })}
          onClick={() => setHandingOut(row)}
        >
          {t("eventRegistrations.medal.markPickedUp")}
        </Button>
      </div>
    );
  }

  async function handOut(row: EventRegistrationRow) {
    setBusy(row.id);
    const result = await markMedalPickedUpAction(row.id).catch(
      () => ({ ok: false, error: "shipFailed" }) as const,
    );
    setBusy(null);

    if (result.ok) {
      setPickedUp((m) => new Map(m).set(row.id, result.pickedUpAt));
    }
    toast(
      result.ok
        ? {
            title: t("eventRegistrations.medal.pickedUpTitle"),
            body: t("eventRegistrations.medal.pickedUpBody", { name: row.runnerName }),
          }
        : {
            title: t("eventRegistrations.shipErrors.pickupTitle"),
            body: t(`eventRegistrations.shipErrors.${result.error}`),
            tone: "danger",
          },
    );
  }

  /** The medal's address, when it is not the kit's already shown above it. */
  function medalAddressLine(row: EventRegistrationRow, className: string) {
    const address = row.medal?.byMail ? row.medal.address : null;
    if (!address || address === row.mailingAddress) return null;
    return (
      <p className={`${className} whitespace-pre-line`}>
        {t("eventRegistrations.medal.mailTo", { address })}
      </p>
    );
  }

  function actions(row: EventRegistrationRow) {
    return (
      <div className="flex flex-col gap-2 md:items-end">
        {shippingControl(row, "kit")}
        {shippingControl(row, "medal")}
        {registrationActions(row)}
      </div>
    );
  }

  function registrationActions(row: EventRegistrationRow) {
    // An accepted or disqualified finish lives on this sign-up; the server
    // refuses both anyway.
    if (row.hasAcceptedResult || row.hasDisqualifiedResult) {
      return (
        <p className="font-mono text-[11px] tracking-[0.08em] text-fg-dim uppercase md:text-right">
          {t(
            row.hasDisqualifiedResult
              ? "eventRegistrations.disqualifiedLocked"
              : "eventRegistrations.resultLocked",
          )}
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-2 md:justify-end">
        {/* Only ATH Móvil was confirmed by hand; Stripe confirmed card payments. */}
        {row.paymentMethod === "ath_movil" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            aria-label={t("eventRegistrations.markPendingAria", {
              name: row.runnerName,
            })}
            onClick={() => setReverting(row)}
          >
            {t("eventRegistrations.markPending")}
          </Button>
        ) : null}
        {removeButton(row)}
      </div>
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
          ? t("eventRegistrations.working")
          : t("eventRegistrations.remove")}
      </Button>
    );
  }

  // What the shipping dialog is about.
  const target = shipping ? parcelOf(shipping.row, shipping.kind) : null;
  const targetCopy = SHIP_COPY[shipping?.kind ?? "kit"];

  function exportCsv() {
    // Contact details go in the file, where the table folds them under the name.
    const header = [
      ...COLUMN_KEYS.map((key) => t(key)),
      t("eventRegistrations.columns.email"),
      t("eventRegistrations.columns.phone"),
      t("eventRegistrations.columns.club"),
      t("eventRegistrations.columns.mailTo"),
      t("eventRegistrations.columns.shipped"),
      t("eventRegistrations.columns.tracking"),
      ...(hasMedals
        ? [
            t("eventRegistrations.columns.medalDelivery"),
            t("eventRegistrations.columns.medalMailTo"),
            t("eventRegistrations.columns.medalShipped"),
            t("eventRegistrations.columns.medalTracking"),
            t("eventRegistrations.columns.medalPickedUp"),
          ]
        : []),
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
      puertoRicoDate(r.paidAt),
      r.email,
      r.phone,
      r.club ?? "",
      r.mailingAddress ?? "",
      r.shippedAt ? puertoRicoDate(r.shippedAt) : "",
      r.shippingTracking ?? "",
      ...(hasMedals
        ? [
            r.medal
              ? t(
                  r.medal.byMail
                    ? "eventRegistrations.medal.deliveryMail"
                    : "eventRegistrations.medal.deliveryPickup",
                )
              : "",
            r.medal?.byMail ? (r.medal.address ?? "") : "",
            r.medal?.shippedAt ? puertoRicoDate(r.medal.shippedAt) : "",
            r.medal?.tracking ?? "",
            r.medal?.pickedUpAt ? puertoRicoDate(r.medal.pickedUpAt) : "",
          ]
        : []),
    ]);
    // Formula-safe: runners type their own names, clubs and addresses.
    const csv = toCsv([header, ...body]);

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
            {hasMedals ? (
              <Checkbox
                checked={onlyMedalsToMail}
                onChange={(e) => {
                  setOnlyMedalsToMail(e.target.checked);
                  setPage(1);
                }}
                label={t("eventRegistrations.medal.filter", {
                  count: fmt.number(medalsToMail),
                })}
                className="sm:mr-auto sm:ml-2 sm:items-center"
              />
            ) : null}
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
                          {row.mailingAddress ? (
                            <p className="mt-1 text-[11px] whitespace-pre-line text-fg-faint">
                              {t("eventRegistrations.mailTo", {
                                address: row.mailingAddress,
                              })}
                            </p>
                          ) : null}
                          {medalAddressLine(row, "mt-1 text-[11px] text-fg-faint")}
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
                        <td className="px-4 py-3 text-right">{actions(row)}</td>
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
                        {row.mailingAddress ? (
                          <p className="mt-0.5 text-[12px] whitespace-pre-line text-fg-dim">
                            {t("eventRegistrations.mailTo", {
                              address: row.mailingAddress,
                            })}
                          </p>
                        ) : null}
                        {medalAddressLine(row, "mt-0.5 text-[12px] text-fg-dim")}
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
                    <div className="mt-3">{actions(row)}</div>
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

      <ConfirmDialog
        open={reverting !== null}
        onClose={() => setReverting(null)}
        onConfirm={() => {
          if (reverting) void revert(reverting);
        }}
        title={t("eventRegistrations.markPendingTitle", {
          name: reverting?.runnerName ?? "",
        })}
        description={t("eventRegistrations.markPendingDescription", {
          bib: reverting?.bib ?? "—",
        })}
        confirmLabel={t("eventRegistrations.markPending")}
      />

      <ConfirmDialog
        open={handingOut !== null}
        onClose={() => setHandingOut(null)}
        onConfirm={() => {
          if (handingOut) void handOut(handingOut);
        }}
        title={t("eventRegistrations.medal.pickupTitle", {
          name: handingOut?.runnerName ?? "",
        })}
        description={t("eventRegistrations.medal.pickupDescription", {
          bib: handingOut?.bib ?? "—",
        })}
        confirmLabel={t("eventRegistrations.medal.markPickedUp")}
      />

      <Modal
        open={shipping !== null}
        onClose={() => setShipping(null)}
        title={t(target?.shippedAt ? targetCopy.trackingTitle : targetCopy.shipTitle, {
          name: shipping?.row.runnerName ?? "",
        })}
        description={t(
          target?.shippedAt ? targetCopy.trackingDescription : targetCopy.shipDescription,
          { name: shipping?.row.runnerName ?? "" },
        )}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShipping(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="ship-kit"
              disabled={busy !== null}
              aria-busy={busy !== null}
            >
              {busy !== null
                ? t("common.saving")
                : t(
                    target?.shippedAt
                      ? "eventRegistrations.saveTracking"
                      : targetCopy.markShipped,
                  )}
            </Button>
          </>
        }
      >
        <form
          id="ship-kit"
          onSubmit={(e) => {
            e.preventDefault();
            if (shipping) void ship(shipping.row, shipping.kind);
          }}
        >
          {target?.address ? (
            <p className="mb-4 text-[13px] whitespace-pre-line text-fg-dim">
              {t("eventRegistrations.mailTo", { address: target.address })}
            </p>
          ) : null}
          <Field
            label={t("eventRegistrations.trackingLabel")}
            hint={t("eventRegistrations.trackingHint")}
            optional
          >
            {(p) => (
              <Input
                {...p}
                name="tracking"
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_TRACKING_LENGTH}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="9400 1000 0000 0000 0000 00…"
              />
            )}
          </Field>
        </form>
      </Modal>
    </section>
  );
}

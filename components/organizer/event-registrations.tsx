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
import {
  markMedalPickedUpAction,
  markShipmentShippedAction,
} from "@/lib/events/shipment";
import { recordRaceResultAction } from "@/lib/results/actions";
import { formatFinishTime, parseFinishTime } from "@/lib/results/evidence";
import { cn } from "@/lib/cn";
import { MAX_TRACKING_LENGTH } from "@/lib/events/vocabulary";
import { focusKey, focusSoon, neighbourOf } from "./row-focus";

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

/** The medal in this row's shipment that has yet to leave, if any. */
const medalDue = (row: EventRegistrationRow) =>
  Boolean(
    row.medal?.byMail &&
    !row.medal.shippedAt &&
    !row.medal.pickedUpAt &&
    !row.hasDisqualifiedResult,
  );

/** The kit in this row's shipment that has yet to leave. */
const kitDue = (row: EventRegistrationRow) =>
  row.kitByMail && !row.shippedAt;

/** What marking the shipment would send now; both false means nothing new. */
function shipmentNow(row: EventRegistrationRow) {
  const medal = medalDue(row) && Boolean(row.medal?.finished);
  // A kit waits for its medal until the race is over.
  const kit =
    kitDue(row) && (medal || !medalDue(row) || Boolean(row.medal?.raceEnded));
  return { kit, medal };
}

/** A shipment that can go out, as it stands, to an address. */
const shipmentToMail = (row: EventRegistrationRow) => {
  const now = shipmentNow(row);
  return Boolean((now.kit || now.medal) && row.mailingAddress);
};

/**
 * The organizer's completed registrations on one event: every paid sign-up,
 * bib assigned, in bib order. Rows come straight from the server render, so a
 * payment confirmed above joins the list on the revalidation that follows.
 * Removing a runner — or putting an ATH Móvil sign-up back to pending — asks
 * first, then drops the row at once rather than waiting for that revalidation.
 * Each runner's shipment, kit and medal together, is marked shipped the same
 * way, which emails them; its tracking number can be changed afterwards
 * without emailing again. A kit that left ahead of its medal is marked again
 * when the medal goes. "Shipments to mail" narrows the list to the ones ready.
 * A runner who cannot get finish evidence in is marked finished here, with
 * the time they give: the result is accepted at once, as a reviewed one.
 */
export function EventRegistrations({
  rows: initial,
  eventId,
  inPerson,
  recordsResults,
  categories,
  slug,
}: {
  rows: EventRegistrationRow[];
  /** Links the race-day check-in station. */
  eventId: string;
  /** Runners gather in one place, so the station is offered. */
  inPerson: boolean;
  /** The event takes results and race day has come: finishes can be recorded. */
  recordsResults: boolean;
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
  const [confirming, setConfirming] = useState<EventRegistrationRow | null>(
    null,
  );
  const [reverting, setReverting] = useState<EventRegistrationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shipping, setShipping] = useState<EventRegistrationRow | null>(null);
  const [tracking, setTracking] = useState("");
  const [onlyToMail, setOnlyToMail] = useState(false);
  // Shipped here, by registration id, ahead of the revalidation that brings it
  // back from the server.
  const [shipped, setShipped] = useState<
    ReadonlyMap<
      string,
      {
        shippedAt: string;
        tracking: string | null;
        medalShippedAt: string | null;
      }
    >
  >(new Map());
  // Medals handed over here, by registration id, likewise.
  const [pickedUp, setPickedUp] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [handingOut, setHandingOut] = useState<EventRegistrationRow | null>(
    null,
  );
  // Finishes recorded here, by registration id, likewise.
  const [finished, setFinished] = useState<ReadonlySet<string>>(new Set());
  const [recording, setRecording] = useState<EventRegistrationRow | null>(null);
  const [finishTime, setFinishTime] = useState("");
  const [finishTimeError, setFinishTimeError] = useState<string>();
  const tableRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Revalidated rows already leave out what was dropped here, so `removed`
  // starts over with them — a sign-up put back to pending and approved again
  // must be able to return.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRemoved(new Set());
    setShipped(new Map());
    setPickedUp(new Map());
    setFinished(new Set());
  }

  const rows = useMemo(
    () =>
      initial
        .filter((r) => !removed.has(r.id))
        .map((r) => {
          const sent = shipped.get(r.id);
          const handedOver = pickedUp.get(r.id);
          // Recorded only while the event takes results, so the medal is
          // earned by the accepted result.
          const done = finished.has(r.id);
          const medal =
            done && r.medal
              ? { ...r.medal, finished: true, canHandOut: true }
              : r.medal;
          return {
            ...r,
            ...(done ? { hasAcceptedResult: true, hasPendingResult: false } : {}),
            ...(sent
              ? { shippedAt: sent.shippedAt, shippingTracking: sent.tracking }
              : {}),
            medal:
              (sent || handedOver) && medal
                ? {
                    ...medal,
                    ...(sent ? { shippedAt: sent.medalShippedAt } : {}),
                    ...(handedOver ? { pickedUpAt: handedOver } : {}),
                  }
                : medal,
          };
        }),
    [initial, removed, shipped, pickedUp, finished],
  );

  // Whether this race tracks medals, or did when some went out.
  const hasMedals = rows.some((r) => r.medal !== null);
  const hasShipments = rows.some((r) => r.kitByMail || r.medal?.byMail);
  const shipmentsToMail = rows.filter(shipmentToMail).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const listed = onlyToMail ? rows.filter(shipmentToMail) : rows;
    if (!q) return listed;
    return listed.filter((r) =>
      `${r.bib ?? ""} ${r.runnerName} ${r.email} ${r.phone} ${r.club ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query, onlyToMail]);

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
    if (row.paymentMethod === "ath_movil")
      return t("eventRegistrations.athMovil");
    if (row.paymentMethod === "stripe") return t("eventRegistrations.card");
    return "—";
  }

  /**
   * Drops a row that was removed or put back to pending. The dialog handed
   * focus back to the row's button as it closed, and the button goes with
   * the row: land on the next runner, or the heading when none is left.
   */
  function drop(row: EventRegistrationRow) {
    const next = neighbourOf(shown, row.id);
    setRemoved((ids) => new Set(ids).add(row.id));
    focusSoon(
      next && focusKey(`name-${next}`),
      sectionRef.current?.querySelector("h2"),
    );
  }

  async function remove(row: EventRegistrationRow) {
    setBusy(row.id);
    const result = await removeRegistrationAction(row.id).catch(
      () => ({ ok: false, error: "removeFailed" }) as const,
    );
    setBusy(null);

    if (result.ok || result.error === "alreadyRemoved") {
      drop(row);
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
      drop(row);
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

  function openShipping(row: EventRegistrationRow) {
    // A medal following its kit gets its own number, not the kit's.
    const following = row.shippedAt && shipmentNow(row).medal;
    setTracking(following ? "" : (row.shippingTracking ?? ""));
    setShipping(row);
  }

  async function ship(row: EventRegistrationRow) {
    setBusy(row.id);
    const result = await markShipmentShippedAction(row.id, tracking).catch(
      () => ({ ok: false, error: "shipFailed" }) as const,
    );
    setBusy(null);

    if (result.ok) {
      setShipped((m) =>
        new Map(m).set(row.id, {
          shippedAt: result.shippedAt,
          tracking: result.tracking,
          medalShippedAt: result.medalShippedAt,
        }),
      );
      setShipping(null);
    }
    // Marking it again, with nothing new to send, only changes the number.
    const now = shipmentNow(row);
    const again = !now.kit && !now.medal;
    toast(
      result.ok
        ? {
            title: t(
              again
                ? "eventRegistrations.trackingSavedTitle"
                : "eventRegistrations.shippedTitle",
            ),
            body: t(
              again
                ? "eventRegistrations.trackingSavedBody"
                : "eventRegistrations.shippedBody",
              { name: row.runnerName },
            ),
          }
        : {
            title: t("eventRegistrations.shipErrors.title"),
            body: t(`eventRegistrations.shipErrors.${result.error}`),
            tone: "danger",
          },
    );
  }

  /** Why a shipment cannot go yet, or null when it can. */
  function shipmentHold(row: EventRegistrationRow) {
    const now = shipmentNow(row);
    if (now.kit || now.medal) {
      return row.mailingAddress ? null : "eventRegistrations.noAddress";
    }
    // Nothing to send now, and nothing has left: it waits for the finish.
    return row.shippedAt ? null : "eventRegistrations.notFinished";
  }

  /** Whether the shipment has left, and the button to say so or to send more. */
  function shippingControl(row: EventRegistrationRow) {
    if (!kitDue(row) && !medalDue(row) && !row.shippedAt) return null;

    const now = shipmentNow(row);
    const toSend = now.kit || now.medal;
    const hold = shipmentHold(row);
    const label = (key: string) => t(key, { name: row.runnerName });

    return (
      <div className="flex flex-col gap-1.5 md:items-end">
        {row.shippedAt ? (
          <p className="font-mono text-[11px] tracking-[0.08em] text-neon-lime uppercase md:text-right">
            {t("eventRegistrations.shippedOn", {
              date: paidOn.format(new Date(row.shippedAt)),
            })}
            {row.shippingTracking ? (
              <span className="block break-all text-fg-dim normal-case">
                {t("eventRegistrations.trackingValue", {
                  tracking: row.shippingTracking,
                })}
              </span>
            ) : null}
          </p>
        ) : null}
        {hold ? (
          <p className="font-mono text-[11px] tracking-[0.08em] text-fg-dim uppercase md:text-right">
            {t(hold)}
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            aria-label={label(
              toSend
                ? "eventRegistrations.markShippedAria"
                : row.shippingTracking
                  ? "eventRegistrations.editTrackingAria"
                  : "eventRegistrations.addTrackingAria",
            )}
            onClick={() => openShipping(row)}
          >
            {t(
              toSend
                ? row.shippedAt
                  ? "eventRegistrations.markMedalShipped"
                  : "eventRegistrations.markShipped"
                : row.shippingTracking
                  ? "eventRegistrations.editTracking"
                  : "eventRegistrations.addTracking",
            )}
          </Button>
        )}
      </div>
    );
  }

  /** A medal picked up in person: when it was, or the button to say so. */
  function pickupControl(
    row: EventRegistrationRow,
    medal: NonNullable<EventRegistrationRow["medal"]>,
  ) {
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
      return note(
        "eventRegistrations.medal.pickedUpOn",
        paidOn.format(new Date(medal.pickedUpAt)),
      );
    }
    if (!medal.canHandOut) return note("eventRegistrations.medal.pickupNotYet");
    return (
      <div className="flex flex-col gap-1.5 md:items-end">
        {note("eventRegistrations.medal.pickupChosen")}
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label={t("eventRegistrations.medal.markPickedUpAria", {
            name: row.runnerName,
          })}
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
      // A note takes the button's place: land on the runner instead.
      focusSoon(focusKey(`name-${row.id}`));
    }
    toast(
      result.ok
        ? {
            title: t("eventRegistrations.medal.pickedUpTitle"),
            body: t("eventRegistrations.medal.pickedUpBody", {
              name: row.runnerName,
            }),
          }
        : {
            title: t("eventRegistrations.shipErrors.pickupTitle"),
            body: t(`eventRegistrations.shipErrors.${result.error}`),
            tone: "danger",
          },
    );
  }

  function openRecording(row: EventRegistrationRow) {
    setFinishTime("");
    setFinishTimeError(undefined);
    setRecording(row);
  }

  async function record(row: EventRegistrationRow) {
    if (parseFinishTime(finishTime) === null) {
      setFinishTimeError(t("recordResult.errors.timeInvalid"));
      return;
    }
    setBusy(row.id);
    const result = await recordRaceResultAction(row.id, finishTime).catch(
      () => ({ ok: false, error: "recordFailed" }) as const,
    );
    setBusy(null);

    if (!result.ok && result.error === "timeInvalid") {
      setFinishTimeError(t("recordResult.errors.timeInvalid"));
      return;
    }
    if (result.ok) {
      setFinished((ids) => new Set(ids).add(row.id));
      setRecording(null);
      // A note takes the button's place: land on the runner instead.
      focusSoon(focusKey(`name-${row.id}`));
    } else if (
      result.error === "resultAlreadyAccepted" ||
      result.error === "resultDisqualified" ||
      result.error === "registrationMissing"
    ) {
      // Settled elsewhere meanwhile; the revalidated list shows how.
      setRecording(null);
    }
    toast(
      result.ok
        ? {
            title: t("recordResult.recordedTitle"),
            body: t("recordResult.recordedBody", {
              name: row.runnerName,
              time: formatFinishTime(result.finishSeconds),
            }),
          }
        : {
            title: t("recordResult.errors.title"),
            body: t(`recordResult.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  function actions(row: EventRegistrationRow) {
    return (
      <div className="flex flex-col gap-2 md:items-end">
        {shippingControl(row)}
        {row.medal && !row.medal.byMail && !row.medal.shippedAt
          ? pickupControl(row, row.medal)
          : null}
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
        {recordsResults ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            aria-label={t("recordResult.markFinishedAria", {
              name: row.runnerName,
            })}
            onClick={() => openRecording(row)}
          >
            {t("recordResult.markFinished")}
          </Button>
        ) : null}
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
        // Dropped while busy, so the name read out is the "Working…" shown.
        aria-label={
          busy === row.id
            ? undefined
            : t("eventRegistrations.removeAria", { name: row.runnerName })
        }
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
  const sending = shipping ? shipmentNow(shipping) : null;
  const sendsMore = Boolean(sending?.kit || sending?.medal);
  const shipTitle = !sendsMore
    ? "eventRegistrations.trackingTitle"
    : shipping?.shippedAt
      ? "eventRegistrations.shipMedalTitle"
      : "eventRegistrations.shipTitle";
  const shipDescription = !sendsMore
    ? "eventRegistrations.trackingDescription"
    : shipping && medalDue(shipping) && !sending?.medal
      ? "eventRegistrations.shipKitOnlyDescription"
      : "eventRegistrations.shipDescription";

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
    <section
      ref={sectionRef}
      id="registrations"
      aria-label={t("eventRegistrations.title")}
    >
      <SectionHeading
        title={t("eventRegistrations.title")}
        kicker={t("eventRegistrations.count", {
          count: fmt.number(rows.length),
        })}
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
            {hasShipments ? (
              <Checkbox
                checked={onlyToMail}
                onChange={(e) => {
                  setOnlyToMail(e.target.checked);
                  setPage(1);
                }}
                label={t("eventRegistrations.shipmentFilter", {
                  count: fmt.number(shipmentsToMail),
                })}
                className="sm:mr-auto sm:ml-2 sm:items-center"
              />
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" size="md" onClick={exportCsv}>
                {t("eventRegistrations.exportCsv")}
              </Button>
              {inPerson ? (
                <Button href={`/organizer/events/${eventId}/checkin`} size="md">
                  {t("eventRegistrations.checkin")}
                </Button>
              ) : null}
            </div>
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
                className="hidden max-h-136 overflow-auto md:block"
              >
                <table className="w-full border-collapse">
                  <caption className="sr-only">
                    {t("eventRegistrations.title")}
                  </caption>
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
                          <p
                            data-focus={`name-${row.id}`}
                            className="text-sm font-bold wrap-break-word"
                          >
                            {row.runnerName}
                          </p>
                          <p className="text-[11px] break-all text-fg-faint">
                            {row.email} · {row.phone}
                          </p>
                          {row.club ? (
                            <p className="text-[11px] text-fg-faint">
                              {row.club}
                            </p>
                          ) : null}
                          {row.mailingAddress ? (
                            <p className="mt-1 text-[11px] whitespace-pre-line text-fg-faint">
                              {t("eventRegistrations.mailTo", {
                                address: row.mailingAddress,
                              })}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-sm">{distance(row)}</td>
                        <td className="px-4 py-3.5 text-sm">
                          {genderLabel(t, row.gender)}
                        </td>
                        <td className="px-4 py-3.5 text-sm tabular-nums">
                          {row.age}
                        </td>
                        <td className="px-4 py-3.5 text-sm">
                          {row.shirtSize ?? "—"}
                        </td>
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
              <ul ref={listRef} className="max-h-136 overflow-y-auto md:hidden">
                {visible.map((row) => (
                  <li
                    key={row.id}
                    className="border-b-2 border-line px-4 py-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          data-focus={`name-${row.id}`}
                          className="text-base font-bold wrap-break-word"
                        >
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
                  <Pagination
                    page={current}
                    pageCount={pageCount}
                    onChange={goTo}
                    label={t("eventRegistrations.title")}
                  />
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
        open={recording !== null}
        onClose={() => setRecording(null)}
        title={t("recordResult.title", { name: recording?.runnerName ?? "" })}
        description={t(
          recording?.hasPendingResult
            ? "recordResult.descriptionPending"
            : "recordResult.description",
          { name: recording?.runnerName ?? "" },
        )}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecording(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="record-result"
              disabled={busy !== null}
              aria-busy={busy !== null}
            >
              {busy !== null ? t("common.saving") : t("recordResult.markFinished")}
            </Button>
          </>
        }
      >
        <form
          id="record-result"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (recording) void record(recording);
          }}
        >
          <Field
            label={t("recordResult.finishTime")}
            hint={t("raceResult.finishTimeHint")}
            error={finishTimeError}
          >
            {(p) => (
              <Input
                {...p}
                name="finish_time"
                value={finishTime}
                onChange={(e) => {
                  setFinishTime(e.target.value);
                  if (finishTimeError) setFinishTimeError(undefined);
                }}
                onBlur={() => {
                  // Show how a loose entry ("12541", "1.25.41") was read.
                  const seconds = parseFinishTime(finishTime);
                  if (seconds !== null) setFinishTime(formatFinishTime(seconds));
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0:25:41"
                className="font-mono tabular-nums"
              />
            )}
          </Field>
        </form>
      </Modal>

      <Modal
        open={shipping !== null}
        onClose={() => setShipping(null)}
        title={t(shipTitle, { name: shipping?.runnerName ?? "" })}
        description={t(shipDescription, { name: shipping?.runnerName ?? "" })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShipping(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="ship-shipment"
              disabled={busy !== null}
              aria-busy={busy !== null}
            >
              {busy !== null
                ? t("common.saving")
                : t(
                    !sendsMore
                      ? "eventRegistrations.saveTracking"
                      : shipping?.shippedAt
                        ? "eventRegistrations.markMedalShipped"
                        : "eventRegistrations.markShipped",
                  )}
            </Button>
          </>
        }
      >
        <form
          id="ship-shipment"
          onSubmit={(e) => {
            e.preventDefault();
            if (shipping) void ship(shipping);
          }}
        >
          {shipping?.mailingAddress ? (
            <p className="mb-4 text-[13px] whitespace-pre-line text-fg-dim">
              {t("eventRegistrations.mailTo", {
                address: shipping.mailingAddress,
              })}
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

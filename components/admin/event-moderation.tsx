"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@/components/i18n/link";
import { useFormat, useLocaleTag, useT } from "@/components/i18n/provider";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { removeEventAction, restoreEventAction } from "@/lib/events/moderation";
import type { AdminEventRow } from "@/lib/events/moderation-queries";

/** Mirrors the check on `event_moderation_log.reason`. */
const MAX_REASON_LENGTH = 500;

/**
 * The admin's list of events to edit or remove, or of removed ones to restore.
 *
 * Removing asks for a reason — the organizer gets it by email — and for the
 * event's name typed out, since it takes a race with runners off the site.
 * An event with a payment still under review says so instead of offering
 * the button. Removing a race not yet run that runners paid for cancels it,
 * and the form warns that their refunds are owed.
 */
export function EventModeration({
  initial,
  removed,
}: {
  initial: AdminEventRow[];
  removed: boolean;
}) {
  const t = useT();
  const [rows, setRows] = useState(initial);

  if (rows.length === 0) {
    return (
      <p className="border-2 border-line p-7 text-[15px] text-fg-dim">
        {t(removed ? "adminEvents.emptyRemoved" : "adminEvents.empty")}
      </p>
    );
  }

  return (
    <ul className="grid gap-4">
      {rows.map((row) => (
        <EventRow
          key={row.id}
          row={row}
          removed={removed}
          onDone={() => setRows((all) => all.filter((r) => r.id !== row.id))}
        />
      ))}
    </ul>
  );
}

function EventRow({
  row,
  removed,
  onDone,
}: {
  row: AdminEventRow;
  removed: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const localeTag = useLocaleTag();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Puerto Rico time, fixed so the server and the browser render the same.
  const removedOn = new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Puerto_Rico",
  });

  const blocked = row.paymentsUnderReview > 0;

  async function restore() {
    setBusy(true);
    const result = await restoreEventAction(row.id).catch(
      () => ({ ok: false, error: "saveFailed" }) as const,
    );
    setBusy(false);
    if (result.ok || result.error === "eventNotFound") onDone();
    toast(
      result.ok
        ? {
            title: t("adminEvents.restoredTitle"),
            body: t("adminEvents.restoredBody", { name: row.name }),
          }
        : {
            title: t("adminEvents.errors.title"),
            body: t(`adminEvents.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  return (
    <li className="border-2 border-line">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-line p-5 sm:p-6">
        <div className="min-w-0">
          <Eyebrow>
            {[
              row.eventDate ? fmt.mediumDate(row.eventDate) : t("organizer.noDate"),
              row.organizerName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Eyebrow>
          <p className="mt-2 text-xl font-extrabold break-words">
            {removed ? (
              row.name
            ) : (
              <Link href={`/events/${row.slug}`} className="hover:text-neon-lime">
                {row.name}
              </Link>
            )}
          </p>
          <p translate="no" className="mt-1 font-mono text-[12px] break-all text-fg-dim">
            /{row.slug}
          </p>
        </div>
        {/* A removed event is restored before anyone edits it again. */}
        {removed ? null : (
          <Button href={`/organizer/events/${row.id}/edit`} variant="outline" size="md">
            {t("adminEvents.edit")}
          </Button>
        )}
      </div>

      <dl className="grid gap-px bg-line sm:grid-cols-3">
        {(
          [
            [t("adminEvents.paidRunners"), row.paidRunners],
            [t("adminEvents.acceptedResults"), row.acceptedResults],
            [t("adminEvents.paymentsUnderReview"), row.paymentsUnderReview],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-ink px-5 py-4 sm:px-6">
            <dt>
              <Eyebrow>{label}</Eyebrow>
            </dt>
            <dd className="mt-1 font-mono text-[15px] font-bold tabular-nums">
              {fmt.number(value)}
            </dd>
          </div>
        ))}
      </dl>

      {removed ? (
        <div className="border-t-2 border-line p-5 sm:p-6">
          {row.removedAt ? (
            <Eyebrow>
              {t("adminEvents.removedOn", {
                date: removedOn.format(new Date(row.removedAt)),
              })}
            </Eyebrow>
          ) : null}
          {row.removalReason ? (
            <p className="mt-2 max-w-[70ch] text-[14px] whitespace-pre-line text-fg-muted">
              {row.removalReason}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {open ? (
              <>
                <p className="mr-auto text-[14px] text-fg-muted">
                  {t("adminEvents.restoreConfirm")}
                </p>
                <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
                  {t("adminEvents.cancel")}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={restore}
                >
                  {busy ? t("adminEvents.working") : t("adminEvents.restoreYes")}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="md" onClick={() => setOpen(true)}>
                {t("adminEvents.restore")}
              </Button>
            )}
          </div>
        </div>
      ) : blocked ? (
        <p className="border-t-2 border-line p-5 text-[14px] text-fg-muted sm:p-6">
          {t("adminEvents.blocked.paymentsUnderReview")}{" "}
          <Link
            href="/admin/payments"
            className="font-bold text-fg underline hover:text-neon-lime"
          >
            {t("adminEvents.reviewPayments")}
          </Link>
        </p>
      ) : open ? (
        <RemoveForm
          row={row}
          onCancel={() => setOpen(false)}
          onRemoved={onDone}
        />
      ) : (
        <div className="border-t-2 border-line p-5 sm:p-6">
          <Button variant="outline" size="md" onClick={() => setOpen(true)}>
            {t("adminEvents.remove")}
          </Button>
        </div>
      )}
    </li>
  );
}

function RemoveForm({
  row,
  onCancel,
  onRemoved,
}: {
  row: AdminEventRow;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [typedName, setTypedName] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!reason.trim()) next.reason = t("adminEvents.errors.reasonRequired");
    else if (reason.trim().length > MAX_REASON_LENGTH)
      next.reason = t("adminEvents.errors.reasonTooLong");
    if (typedName.trim() !== row.name.trim())
      next.name = t("adminEvents.errors.nameMismatch");
    setErrors(next);
    if (next.reason || next.name) {
      const form = e.currentTarget;
      form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }

    setBusy(true);
    const result = await removeEventAction(row.id, reason).catch(
      () => ({ ok: false, error: "saveFailed" }) as const,
    );
    setBusy(false);

    if (result.ok || result.error === "alreadyRemoved") onRemoved();
    toast(
      result.ok
        ? {
            title: t("adminEvents.removedTitle"),
            body: t("adminEvents.removedBody", { name: row.name }),
          }
        : {
            title: t("adminEvents.errors.title"),
            body: t(`adminEvents.errors.${result.error}`),
            tone: "danger",
          },
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-5 border-t-2 border-line p-5 sm:p-6"
    >
      <p className="max-w-[70ch] text-[14px] leading-relaxed text-fg-muted">
        {t("adminEvents.removeExplainer", {
          runners: fmt.number(row.paidRunners),
          results: fmt.number(row.acceptedResults),
        })}
      </p>
      {row.paidRunners > 0 && !row.finished ? (
        <p
          role="note"
          className="max-w-[70ch] border-2 border-danger p-4 text-[14px] leading-relaxed text-fg"
        >
          {t("adminEvents.refundWarning", {
            runners: fmt.number(row.paidRunners),
          })}
        </p>
      ) : null}
      <Field
        label={t("adminEvents.reason")}
        hint={t("adminEvents.reasonHint")}
        error={errors.reason}
      >
        {(props) => (
          <Textarea
            {...props}
            name="reason"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            placeholder={t("adminEvents.reasonPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t("adminEvents.typeName", { name: row.name })}
        error={errors.name}
      >
        {(props) => (
          <Input
            {...props}
            name="confirm-name"
            autoComplete="off"
            spellCheck={false}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="md" onClick={onCancel}>
          {t("adminEvents.cancel")}
        </Button>
        <Button
          type="submit"
          variant="danger"
          size="md"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? t("adminEvents.working") : t("adminEvents.removeYes")}
        </Button>
      </div>
    </form>
  );
}

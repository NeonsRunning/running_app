"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { focusFirstInvalid } from "@/components/ui/focus";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import { deleteRaceResultAction } from "@/lib/results/corrections";
import { REVIEW_NOTE_MAX } from "@/lib/results/evidence";

/** What the dialog needs of a result; a `CorrectableResult` has it all. */
export type DeletableResult = {
  id: string;
  runnerName: string;
  eventName: string;
  /** What `admin_delete_race_result()` checks nothing changed since. */
  version: string;
};

/**
 * A platform admin's "Delete result": the result goes outright, whatever its
 * status — waiting for review, sent back, accepted or disqualified — with
 * its screenshot and the medal an accepted one carried. The runner is left
 * with no result for the event and can send a new one. A reason is required
 * and kept in the deletion log; nobody is emailed. Used from the event's
 * review queue and reviewed results, and from the profile's race history.
 */
export function DeleteResultButton({
  result,
  disabled,
  className,
}: {
  result: DeletableResult;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Remounted on each open, so the reason starts blank.
  const [session, setSession] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled}
        aria-label={t("resultDeletion.deleteAria", {
          name: result.runnerName,
          event: result.eventName,
        })}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {t("resultDeletion.delete")}
      </Button>
      {open ? (
        <DeleteResultDialog key={session} result={result} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function DeleteResultDialog({
  result,
  onClose,
}: {
  result: DeletableResult;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const formId = useId();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function close() {
    if (!busy) onClose();
  }

  function requireReason() {
    setReasonError(t("resultDeletion.errors.reasonRequired"));
    focusFirstInvalid();
  }

  async function confirm() {
    if (!reason.trim()) return requireReason();

    setBusy(true);
    const deleted = await deleteRaceResultAction({
      resultId: result.id,
      version: result.version,
      reason,
    }).catch(() => ({ ok: false, error: "deleteFailed" }) as const);
    setBusy(false);

    if (!deleted.ok) {
      if (deleted.error === "reasonRequired") return requireReason();
      toast({
        title: t("resultDeletion.errors.title"),
        body: t(`resultDeletion.errors.${deleted.error}`),
        tone: "danger",
      });
      // Refreshed underneath: the dialog no longer matches the result.
      if (deleted.error === "alreadyChanged") onClose();
      return;
    }

    toast({
      title: t("resultDeletion.deletedTitle"),
      body: t("resultDeletion.deletedBody", {
        name: result.runnerName,
        event: result.eventName,
      }),
    });
    onClose();
  }

  return (
    <Modal
      open
      onClose={close}
      title={t("resultDeletion.title")}
      description={t("resultDeletion.description", {
        name: result.runnerName,
        event: result.eventName,
      })}
      className="max-h-[100dvh] overflow-y-auto overscroll-contain"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={close}>
            {t("resultDeletion.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? t("resultDeletion.working") : t("resultDeletion.confirm")}
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
          void confirm();
        }}
      >
        <p className="text-[14px] text-fg-muted">
          {t("resultDeletion.body", { name: result.runnerName })}
        </p>
        <Field
          label={t("resultDeletion.reason")}
          hint={t("resultDeletion.reasonHint")}
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

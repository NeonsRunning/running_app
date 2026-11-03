"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { focusElement } from "@/components/ui/focus";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import { deleteEventAction } from "@/lib/events/actions";
import { cn } from "@/lib/cn";

/**
 * Delete an event from its dashboard card, after a confirmation. The action
 * revalidates the layout for the totals; `onDeleted` lets a list that loaded
 * its cards on the client drop the card itself.
 */
export function DeleteEventButton({
  id,
  name,
  live,
  className,
  onDeleted,
}: {
  id: string;
  name: string;
  live: boolean;
  className?: string;
  onDeleted?: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The dialog hands focus back to this button as it closes, just as the
  // delete disables it, so the focus drops to the page. A failed delete
  // leaves the button here: give it the focus back. (A deleted card's list
  // moves it on; see OrganizerEventList.)
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && document.activeElement === document.body) {
      focusElement(buttonRef.current);
    }
    wasPending.current = pending;
  }, [pending]);

  function remove() {
    startTransition(async () => {
      const result = await deleteEventAction(id).catch(() => ({
        ok: undefined,
        error: "deleteFailed",
      }));
      if (result.ok) onDeleted?.();
      toast(
        result.ok
          ? {
              title: t("publish.deletedTitle"),
              body: t("publish.deletedBody", { name }),
            }
          : {
              title: t("publish.deleteFailedTitle"),
              body: t(`publish.errors.${result.error ?? "deleteFailed"}`),
              tone: "danger",
            },
      );
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-busy={pending}
        // Dropped while deleting, so the name read out is the "Deleting…" shown.
        aria-label={pending ? undefined : t("publish.deleteAria", { name })}
        className={cn(className, "hover:border-danger hover:text-danger disabled:opacity-40")}
      >
        {pending ? t("publish.deleting") : t("publish.delete")}
      </button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title={t("publish.deleteTitle", { name })}
        description={t(live ? "publish.deleteLiveDescription" : "publish.deleteDescription")}
        confirmLabel={t("publish.delete")}
        destructive
      />
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import { deleteEventAction } from "@/lib/events/actions";
import { cn } from "@/lib/cn";

/**
 * Delete an event from its dashboard card, after a confirmation. The action
 * revalidates the layout, so the card disappears on its own.
 */
export function DeleteEventButton({
  id,
  name,
  live,
  className,
}: {
  id: string;
  name: string;
  live: boolean;
  className?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteEventAction(id);
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
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-busy={pending}
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

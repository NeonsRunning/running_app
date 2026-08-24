"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Dialog with the three behaviours a modal must have: Escape closes it, focus
 * moves inside on open and returns on close, and Tab stays within the panel.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  const t = useT();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-6">
      {/* Backdrop click target, kept out of the tab order. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-rise-in relative w-full max-w-lg border-2 border-line-strong bg-charcoal",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-line px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-black uppercase">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-sm text-fg-dim">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeDialog")}
            className="-mt-1 shrink-0 px-2 py-1 text-lg text-fg-dim hover:text-fg"
          >
            ✕
          </button>
        </div>
        {children ? <div className="px-6 py-6">{children}</div> : null}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t-2 border-line px-6 py-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

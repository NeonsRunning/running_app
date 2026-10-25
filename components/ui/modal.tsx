"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Mark everything on the page outside `el` inert — unfocusable, unclickable
 * and hidden from assistive technology — by walking up from `el` and marking
 * the siblings at each level. Returns the undo. Elements already inert are
 * left alone, so a dialog opened over another undoes only its own marks, and
 * anything with `data-modal-exempt` (the toast stack, which must still be
 * announced) stays live.
 */
function inertOutside(el: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  for (let node = el; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert || sibling.hasAttribute("data-modal-exempt")) continue;
      sibling.inert = true;
      marked.push(sibling);
    }
  }
  return () => {
    for (const sibling of marked) sibling.inert = false;
  };
}

/**
 * Dialog with the three behaviours a modal must have: Escape closes it, focus
 * moves inside on open and returns on close, and Tab stays within the panel.
 *
 * Tab is kept in two ways. The page behind is made inert while the dialog is
 * open, so nothing there can take focus by any route — Tab, a click, a
 * screen reader's virtual cursor. And Tab is wrapped by hand at the panel's
 * ends, including when focus sits on the panel itself (it takes focus when
 * its plain text is clicked) rather than on a control inside it.
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const restoreTo = useRef<HTMLElement | null>(null);
  // The latest onClose, read when Escape is pressed. Callers often pass a new
  // function on every render; depending on it would re-run the effect below
  // on each keystroke in a field inside the dialog, and every re-run hands
  // focus back to the first button.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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

    const restoreInert = overlayRef.current ? inertOutside(overlayRef.current) : () => {};
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // On the panel itself, or somewhere it should not be: back inside.
      if (!active || active === panel || !items.includes(active as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
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
      // Before restoring focus: an inert element cannot take it.
      restoreInert();
      restoreTo.current?.focus();
    };
  }, [open]);

  const t = useT();

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-80 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-6"
    >
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
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        // Takes focus when non-focusable text inside is clicked, instead of
        // the page body; Tab then wraps from here.
        tabIndex={-1}
        className={cn(
          "animate-rise-in relative w-full max-w-lg border-2 border-line-strong bg-charcoal focus:outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-line px-6 py-5">
          <div>
            <h2 id={titleId} className="font-display text-2xl font-black uppercase">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1.5 text-sm text-fg-dim">
                {description}
              </p>
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
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
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

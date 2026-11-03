"use client";

import { focusElement } from "@/components/ui/focus";

/** Something to focus: a selector, resolved once the frame has rendered, or an element. */
export type FocusTarget = string | HTMLElement | null | undefined;

/**
 * On the next frame, focuses the first of `targets` that is on screen. For
 * a review queue whose row just left or whose inline confirm just closed:
 * the button that had focus is gone, and focus would otherwise fall to
 * `<body>`. Selectors are matched only among elements with a box, since the
 * organizer tables render each row twice — a table row and a phone card,
 * one of them hidden.
 */
export function focusSoon(...targets: FocusTarget[]) {
  requestAnimationFrame(() => {
    for (const target of targets) {
      const el =
        typeof target === "string"
          ? Array.from(document.querySelectorAll<HTMLElement>(target)).find(
              (e) => e.getClientRects().length > 0,
            )
          : target;
      if (el?.isConnected && el.getClientRects().length > 0) {
        focusElement(el);
        return;
      }
    }
  });
}

/**
 * The id of the row to land on once `id` leaves `list`: the one after it,
 * or before it when it was last.
 */
export function neighbourOf<T extends { id: string }>(list: readonly T[], id: string) {
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  return (list[i + 1] ?? list[i - 1])?.id;
}

/** Selector for the element marked `data-focus="<key>"`. */
export const focusKey = (key: string) => `[data-focus="${CSS.escape(key)}"]`;

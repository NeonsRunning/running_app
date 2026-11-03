"use client";

import { useEffect, useRef } from "react";

/**
 * Moves focus to `el` and brings it on screen. Headings and other elements
 * that aren't focusable get `tabindex="-1"` first, so they can take focus
 * without joining the tab order.
 */
export function focusElement(
  el: HTMLElement | null | undefined,
  block: ScrollLogicalPosition = "center",
) {
  if (!el) return;
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block });
}

/**
 * After a render, focuses the first invalid control under `root` (or the page),
 * so a validation message is read out where it applies rather than the user
 * hearing a burst of alerts and having to hunt for the field.
 */
export function focusFirstInvalid(root?: ParentNode | null) {
  requestAnimationFrame(() => {
    focusElement(
      (root ?? document).querySelector<HTMLElement>('[aria-invalid="true"]'),
    );
  });
}

/**
 * When `key` changes — a wizard step, a swapped screen — moves focus to the
 * page's `<h1>`. Otherwise focus is left on a button that just unmounted (and
 * falls to `<body>`) or on one whose surroundings changed without a word to a
 * screen reader. Comparing against the previous key, rather than skipping the
 * first run, keeps Strict Mode's double effect from stealing focus on mount.
 */
export function useFocusHeadingOnChange(key: unknown) {
  const previous = useRef(key);
  useEffect(() => {
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    requestAnimationFrame(() => {
      const main = document.getElementById("main") ?? document;
      focusElement(main.querySelector<HTMLElement>("h1"), "start");
    });
  }, [key]);
}

/**
 * For a form posted through `useActionState`: whenever a new `state` comes
 * back, focuses the first field the server marked invalid. Attach the returned
 * ref to the `<form>`.
 */
export function useFocusFirstInvalid(state: unknown) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state !== undefined) focusFirstInvalid(ref.current);
  }, [state]);
  return ref;
}

"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { useLayoutEffect, useRef } from "react";

const STEP: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

function radios(group: HTMLElement) {
  return Array.from(
    group.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
  );
}

/**
 * `role="radiogroup"` for options rendered as `<button role="radio">` cards,
 * with the keyboard model of a native radio group (WAI-ARIA APG): the group is
 * one tab stop — the checked option, or the first when none is — and the arrow
 * keys move between options and select as they go.
 */
export function RadioGroup({ onKeyDown, ...rest }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  // Runs after every render: which option is checked is the parent's state.
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const options = radios(group);
    const stop =
      options.find((o) => o.getAttribute("aria-checked") === "true") ?? options[0];
    for (const o of options) o.tabIndex = o === stop ? 0 : -1;
  });

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    const step = STEP[e.key];
    if (!step || e.defaultPrevented) return;
    const options = radios(e.currentTarget);
    const at = options.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    e.preventDefault();
    const next = options[(at + step + options.length) % options.length];
    next.focus();
    next.click();
  }

  return <div ref={ref} role="radiogroup" onKeyDown={onKey} {...rest} />;
}

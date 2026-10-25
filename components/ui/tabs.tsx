"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = { value: T; label: ReactNode };

/**
 * ARIA tablist with roving focus. Arrow keys move between tabs, Home/End jump
 * to the ends — the keyboard contract screen-reader users expect from tabs.
 *
 * Tabs and their panels link up by id. The ids are namespaced by `id`, from
 * `useTabsId()` in the component rendering both, so two tab sets on one page
 * — or a tab value that happens to match another element's id — never
 * collide.
 */
export function useTabsId(): string {
  return useId();
}

const tabId = (ns: string, value: string) => `${ns}-tab-${value}`;
const panelId = (ns: string, value: string) => `${ns}-panel-${value}`;

export function Tabs<T extends string>({
  id,
  items,
  value,
  onChange,
  label,
  className,
  scrollable = true,
}: {
  /** From `useTabsId()`; the same value goes to every `TabPanel`. */
  id: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  scrollable?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTabAt(index: number) {
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!buttons?.length) return;
    const clamped = (index + buttons.length) % buttons.length;
    buttons[clamped].focus();
    onChange(items[clamped].value);
  }

  const activeIndex = items.findIndex((i) => i.value === value);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(
        "flex border-b-2 border-line",
        scrollable && "no-scrollbar overflow-x-auto",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          focusTabAt(activeIndex + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          focusTabAt(activeIndex - 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          focusTabAt(0);
        } else if (e.key === "End") {
          e.preventDefault();
          focusTabAt(items.length - 1);
        }
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            id={tabId(id, item.value)}
            aria-selected={active}
            aria-controls={panelId(id, item.value)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              "shrink-0 border-r-2 border-b-[3px] px-5 py-4 text-[13px] font-extrabold uppercase tracking-[0.12em] whitespace-nowrap transition-colors duration-150 last:border-r-0",
              "-mb-[2px] border-r-line",
              active
                ? "border-b-neon-yellow text-fg"
                : "border-b-transparent text-fg-dim hover:text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  value,
  active,
  children,
}: {
  /** The `id` given to `Tabs`. */
  id: string;
  value: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(id, value)}
      aria-labelledby={tabId(id, value)}
      tabIndex={0}
      className="focus-visible:outline-none"
    >
      {children}
    </div>
  );
}

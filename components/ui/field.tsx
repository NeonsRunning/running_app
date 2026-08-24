"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full border-2 border-line-strong bg-carbon px-4 py-3.5 text-base text-fg placeholder:text-fg-faint transition-colors duration-150 hover:border-line-bright focus:border-neon-lime focus:outline-none disabled:opacity-40 aria-[invalid=true]:border-danger";

/**
 * Label + control + help/error wrapper. Wires `htmlFor`, `aria-describedby`
 * and `aria-invalid` so validation is announced rather than merely coloured.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const t = useT();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col", className)}>
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint"
      >
        {label}
        {optional ? (
          <span className="text-fg-faint"> — {t("common.optional")}</span>
        ) : null}
      </label>
      <div className="mt-2">
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-[13px] text-fg-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(CONTROL, "min-h-32 resize-y", className)} {...rest} />
  );
}

export function Select({
  className,
  children,
  ...rest
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL, "appearance-none pr-11", className)}
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-dim"
      >
        ▾
      </span>
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-3 text-sm text-fg-muted",
        className,
      )}
    >
      <input type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-line-strong text-transparent transition-colors group-hover:border-neon-lime peer-checked:border-neon-lime peer-checked:bg-neon-lime peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neon-yellow"
      >
        <span className="text-xs font-black">✓</span>
      </span>
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function Radio({
  label,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-center gap-3 text-sm text-fg-muted",
        className,
      )}
    >
      <input type="radio" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 border-2 border-line-strong transition-colors group-hover:border-neon-lime peer-checked:border-neon-lime peer-checked:bg-neon-lime peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neon-yellow"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * A pill that toggles a filter value. Rendered as a real button so it is
 * reachable by keyboard and exposes its state to assistive tech.
 */
export function Chip({
  active,
  children,
  className,
  ...rest
}: Omit<ComponentProps<"button">, "className" | "children"> & {
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "shrink-0 border-2 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors duration-150",
        active
          ? "border-neon-lime bg-neon-lime text-ink"
          : "border-line-strong text-fg-muted hover:border-fg-dim hover:text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Mutually exclusive options rendered as one connected control. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex border-2 border-line-strong", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] transition-colors duration-150",
              active
                ? "bg-neon-lime text-ink"
                : "text-fg-dim hover:bg-graphite hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

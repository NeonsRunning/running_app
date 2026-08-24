import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./badge";

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <As className={cn("border-2 border-line bg-carbon", className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b-2 border-line px-6 py-4",
        className,
      )}
    >
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-fg-dim">
        {title}
      </h2>
      {action}
    </div>
  );
}

/**
 * A single headline number. `accent` is reserved for the one or two figures
 * that matter most on a screen — the rest stay white so neon keeps its meaning.
 */
export function StatCard({
  value,
  label,
  suffix,
  accent,
  className,
}: {
  value: ReactNode;
  label: string;
  suffix?: string;
  accent?: "yellow" | "lime" | "green";
  className?: string;
}) {
  const color =
    accent === "yellow"
      ? "text-neon-yellow"
      : accent === "lime"
        ? "text-neon-lime"
        : accent === "green"
          ? "text-neon-green"
          : "text-fg";

  return (
    <div className={cn("px-6 py-7 sm:px-8", className)}>
      <div
        className={cn(
          "font-display text-4xl leading-none font-black tracking-[-0.035em] sm:text-5xl",
          color,
        )}
      >
        {value}
        {suffix ? (
          <span className="text-xl text-fg-dim"> {suffix}</span>
        ) : null}
      </div>
      <Eyebrow className="mt-2 tracking-[0.18em] text-fg-dim">{label}</Eyebrow>
    </div>
  );
}

/** Label/value pair used across event specs and detail grids. */
export function SpecCell({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  accent?: "yellow" | "lime";
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-6", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={cn(
          "mt-2 font-display text-xl font-black tracking-[-0.01em] sm:text-2xl",
          accent === "yellow"
            ? "text-neon-yellow"
            : accent === "lime"
              ? "text-neon-lime"
              : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

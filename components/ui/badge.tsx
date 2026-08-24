"use client";

import type { ReactNode } from "react";
import { useT } from "@/components/i18n/provider";
import { difficultyLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { Difficulty, RegistrationStatus } from "@/lib/types";

export type BadgeTone =
  | "yellow"
  | "lime"
  | "green"
  | "neutral"
  | "outline"
  | "danger";

const TONES: Record<BadgeTone, string> = {
  yellow: "bg-neon-yellow text-ink",
  lime: "bg-neon-lime/16 text-neon-lime",
  green: "bg-neon-green/16 text-neon-green",
  neutral: "bg-graphite text-fg-muted",
  outline: "border-2 border-line-strong text-fg-muted",
  danger: "bg-danger/16 text-danger",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RegistrationStatus, BadgeTone> = {
  open: "lime",
  "opening-soon": "outline",
  "almost-full": "yellow",
  waitlist: "neutral",
  closed: "danger",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: RegistrationStatus;
  label: string;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {label}
    </Badge>
  );
}

const DIFFICULTY_TONE: Record<Difficulty, BadgeTone> = {
  Easy: "green",
  Moderate: "lime",
  Hard: "yellow",
};

export function DifficultyBadge({ level }: { level: Difficulty }) {
  const t = useT();
  return <Badge tone={DIFFICULTY_TONE[level]}>{difficultyLabel(t, level)}</Badge>;
}

/** Small monospace label used above data — the platform's "eyebrow" style. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}

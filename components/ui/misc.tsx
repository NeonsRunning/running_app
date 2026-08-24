"use client";

import { Link } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Eyebrow } from "./badge";

/** Capacity / completion meter. Communicates value in text as well as fill. */
export function Progress({
  value,
  max,
  label,
  tone = "lime",
  className,
}: {
  value: number;
  max: number;
  label?: string;
  tone?: "lime" | "yellow" | "green";
  className?: string;
}) {
  const t = useT();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "yellow"
      ? "bg-neon-yellow"
      : tone === "green"
        ? "bg-neon-green"
        : "bg-neon-lime";

  return (
    <div className={className}>
      {label ? (
        <div className="flex items-baseline justify-between">
          <Eyebrow>{label}</Eyebrow>
          <span className="text-[13px] font-bold">
            {value} / {max}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? t("common.progress")}
        className="mt-3 h-2 w-full bg-graphite"
      >
        <div className={cn("h-2 transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "🏁",
  title,
  body,
  action,
  className,
}: {
  icon?: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center border-2 border-dashed border-line px-6 py-16 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center border-2 border-line-strong text-3xl"
      >
        {icon}
      </div>
      <h3 className="mt-6 font-display text-2xl font-black uppercase">{title}</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-dim">{body}</p>
      {action ? (
        <Button href={action.href} size="md" className="mt-7">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
  className,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const t = useT();
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <nav
      aria-label={t("common.pagination")}
      className={cn("flex items-center gap-2", className)}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="border-2 border-line-strong px-3 py-2 font-mono text-xs text-fg-muted disabled:opacity-30 hover:enabled:border-fg-dim"
      >
        {t("common.prev")}
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? "page" : undefined}
          onClick={() => onChange(p)}
          className={cn(
            "flex h-10 w-10 items-center justify-center text-[13px] font-bold transition-colors",
            p === page
              ? "bg-neon-lime text-ink"
              : "border-2 border-line-strong text-fg-muted hover:border-fg-dim hover:text-fg",
          )}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        className="border-2 border-line-strong px-3 py-2 font-mono text-xs text-fg-muted disabled:opacity-30 hover:enabled:border-fg-dim"
      >
        {t("common.nextPage")}
      </button>
    </nav>
  );
}

/** Stacked circular initials, used for participant and follower clusters. */
export function AvatarStack({
  people,
  extra,
  size = "md",
}: {
  people: { initials: string; accent?: "lime" | "yellow" | "green" }[];
  extra?: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";
  return (
    <div className="flex">
      {people.map((p, i) => (
        <div
          key={`${p.initials}-${i}`}
          className={cn(
            "flex items-center justify-center border-2 border-ink font-black",
            dim,
            i > 0 && "-ml-2",
            p.accent === "lime"
              ? "bg-gradient-to-br from-neon-lime to-neon-green text-ink"
              : p.accent === "yellow"
                ? "bg-graphite text-neon-yellow"
                : p.accent === "green"
                  ? "bg-graphite text-neon-green"
                  : "bg-graphite text-fg",
          )}
        >
          {p.initials}
        </div>
      ))}
      {extra ? (
        <div
          className={cn(
            "-ml-2 flex items-center justify-center border-2 border-ink bg-graphite font-black text-fg-dim",
            dim,
          )}
        >
          +{extra}
        </div>
      ) : null}
    </div>
  );
}

/** Section heading with an optional "see all" link, used down the landing page. */
export function SectionHeading({
  title,
  kicker,
  href,
  hrefLabel,
  className,
}: {
  title: string;
  kicker?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
}) {
  const t = useT();
  const linkLabel = hrefLabel ?? t("common.viewAllArrow");

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-6 gap-y-3 border-b-2 border-line pb-5",
        className,
      )}
    >
      <h2 className="font-display text-3xl font-black uppercase sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {kicker ? (
        <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase sm:pb-2">
          {kicker}
        </span>
      ) : null}
      <div className="flex-1" />
      {href ? (
        <Link
          href={href}
          className="text-[13px] font-extrabold tracking-[0.12em] text-neon-lime uppercase hover:text-neon-yellow sm:pb-2"
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}

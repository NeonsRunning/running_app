"use client";

import Image from "next/image";

import { Link } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Brand assets.
 *
 * Both marks are cut from the same supplied artwork, exported as premultiplied
 * glow on transparency so they composite onto any of the dark surfaces without
 * a visible black plate:
 *
 *   public/brand/neons-running.png  the full badge — ring, runners, wordmark
 *   public/brand/neons-mark.png     the winged N alone, for small lockups
 *
 * The badge carries its own wordmark, so it is only legible from ~56px up; use
 * `NeonsEmblem` below that. `app/icon.png` and `app/apple-icon.png` are the
 * same emblem.
 */

/** The full badge. Give it room — it holds the wordmark and the tagline. */
export function NeonsMark({
  size = 44,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src="/brand/neons-running.png"
      alt={title ?? ""}
      width={size}
      height={size}
      loading="eager"
      className={cn("block shrink-0", className)}
    />
  );
}

/** The winged N cut from the badge — stays crisp at header sizes. */
export function NeonsEmblem({
  size = 36,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src="/brand/neons-mark.png"
      alt={title ?? ""}
      width={size}
      height={size}
      loading="eager"
      className={cn("block shrink-0", className)}
    />
  );
}

export function NeonsWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span
        className={cn(
          "text-gradient-neon font-display font-black tracking-[-0.04em] italic",
          compact ? "text-lg" : "text-xl",
        )}
      >
        NEONS
      </span>
      <span
        className={cn(
          "font-mono font-medium tracking-[0.34em] text-fg-dim",
          compact ? "text-[8px]" : "text-[9px]",
        )}
      >
        RUNNING
      </span>
    </span>
  );
}

/** Emblem + wordmark, linked home. The header and footer both use this. */
export function BrandLock({
  className,
  size = 40,
  compact = false,
}: {
  className?: string;
  size?: number;
  compact?: boolean;
}) {
  const t = useT();

  return (
    <Link
      href="/"
      className={cn("flex shrink-0 items-center gap-3", className)}
      aria-label={t("common.brandHome")}
    >
      <NeonsEmblem size={size} />
      <NeonsWordmark compact={compact} />
    </Link>
  );
}

/** The brand's Spanish tagline, set as a rule-and-text lockup. */
export function BrandTagline({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 font-mono text-[11px] tracking-[0.2em] text-neon-lime uppercase",
        className,
      )}
    >
      <span aria-hidden="true" className="h-0.5 w-7 bg-neon-lime" />
      Corremos · Superamos · Inspiramos
    </div>
  );
}

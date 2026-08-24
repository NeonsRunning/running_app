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

/**
 * The emblem's own proportions, straight off `public/brand/neons-mark.png`.
 * The N carries wings, so the mark is a wide one — a square box would render it
 * as a sliver a third the height of anything set beside it.
 */
const EMBLEM_RATIO = 512 / 191;

/**
 * The winged N cut from the badge — stays crisp at header sizes. Sized by
 * height, like the type it sits next to; the width follows from the artwork.
 */
export function NeonsEmblem({
  height = 26,
  className,
  title,
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src="/brand/neons-mark.png"
      alt={title ?? ""}
      width={Math.round(height * EMBLEM_RATIO)}
      height={height}
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
      {/*
        The padding is what keeps the S whole. Archivo ships no italic face, so
        this is a synthesized oblique: the browser skews the upright glyphs and
        leaves their advance widths alone, which puts the top-right of the last
        letter outside the element's box — and `text-gradient-neon` paints with
        `background-clip: text`, so anything outside that box simply is not
        painted. The negative tracking pulls the right edge in further still.
        The matching negative margin hands the space back, so the lockup keeps
        its measurements and only the paintable box grows.
      */}
      <span
        className={cn(
          "text-gradient-neon font-display font-black tracking-[-0.04em] italic",
          "pr-[0.25em] -mr-[0.25em]",
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

/**
 * Emblem + wordmark, linked home. The header and footer both use this.
 *
 * The emblem is set to the height of the two wordmark lines beside it — 18 + 8
 * compact, 20 + 9 otherwise, all at `leading-none` — so the lockup reads as one
 * block. That leaves nothing to size from outside, hence no `size` prop.
 */
export function BrandLock({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useT();

  return (
    <Link
      href="/"
      className={cn("flex shrink-0 items-center gap-3", className)}
      aria-label={t("common.brandHome")}
    >
      <NeonsEmblem height={compact ? 26 : 29} />
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

"use client";

import { Link } from "@/components/i18n/link";
import { useFormat, useT } from "@/components/i18n/provider";
import { eventTypeLabel, distanceLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { RunningEvent } from "@/lib/types";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveButton } from "./saved-events";

/** The gradient cover placeholder every event uses until real photography lands. */
export function EventCover({
  event,
  className,
  children,
}: {
  event: RunningEvent;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useT();

  return (
    <div className={cn("bg-cover-wash relative overflow-hidden", className)}>
      <div aria-hidden="true" className="bg-track-lanes absolute inset-0" />
      {/* City skyline and palms, kept to a whisper so the neon stays loud. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 60"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-2/5 w-full text-ink/75"
      >
        <g fill="currentColor">
          {/* Skyline blocks. */}
          <path d="M0 60V44h9v-8h7v8h10V33h8v11h12v-6h9v6h11V30h10v14h13v-9h8v9h12v-5h9v5h11V36h8v8h10v-6h8v6h13v-9h8v9h14V60Z" />
          {/* Two palms, one each side. */}
          <rect x="27" y="26" width="2" height="34" />
          <path d="M28 27c-6-5-12-4-16 0 6-2 11 0 14 3-5-8-3-14 3-17-3 5-2 10 0 13 1-8 6-12 12-12-6 3-10 8-11 14Z" />
          <rect x="171" y="22" width="2" height="38" />
          <path d="M172 23c-7-5-13-4-17 0 6-2 11 0 15 4-6-9-4-15 2-18-3 5-2 11 0 15 2-9 7-13 13-13-6 3-11 7-13 12Z" />
        </g>
      </svg>
      <Badge
        tone="neutral"
        className="absolute top-0 left-0 bg-ink font-mono text-[10px] font-normal tracking-[0.14em] text-neon-lime"
      >
        {eventTypeLabel(t, event.type)}
      </Badge>
      {children}
    </div>
  );
}

/** Date block — the race-bib style calendar tile. */
export function DateBlock({
  event,
  className,
}: {
  event: RunningEvent;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div className="font-mono text-[11px] tracking-[0.2em] text-neon-lime">
        {event.dow}
      </div>
      <div className="font-display text-4xl leading-none font-black tracking-[-0.03em] lg:text-5xl">
        {event.day}
      </div>
      <div className="font-mono text-[11px] tracking-[0.2em] text-fg-dim">
        {event.month}
      </div>
    </div>
  );
}

/**
 * Horizontal event row — the primary listing shape on tablet and up. On small
 * screens it reflows into a stacked card rather than shrinking.
 */
export function EventRow({ event }: { event: RunningEvent }) {
  const t = useT();
  const fmt = useFormat();

  return (
    <article className="grid grid-cols-1 border-t-2 border-line bg-ink transition-colors hover:bg-carbon md:grid-cols-[220px_1fr_150px_220px] lg:grid-cols-[260px_1fr_170px_240px]">
      <Link
        href={`/events/${event.slug}`}
        className="block"
        tabIndex={-1}
        aria-hidden="true"
      >
        <EventCover event={event} className="h-44 md:h-full md:min-h-44" />
      </Link>

      <div className="flex flex-col gap-2.5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={event.registrationStatus} label={event.statusLabel} />
          <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
            {event.city}, {event.region}
          </span>
        </div>
        <h3 className="font-display text-2xl font-black uppercase sm:text-3xl">
          <Link
            href={`/events/${event.slug}`}
            className="transition-colors hover:text-neon-lime"
          >
            {event.name}
          </Link>
        </h3>
        <p className="text-sm text-fg-dim md:hidden">{event.tagline}</p>
        <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1.5 pt-2 text-[13px] text-fg-muted">
          <span>
            <b className="font-bold text-fg">
              {distanceLabel(t, event.featuredDistance)}
            </b>{" "}
            · {event.terrain}
          </span>
          <span>
            {t("events.card.runners", { count: fmt.number(event.registered) })}
          </span>
          <span>{t("events.card.start", { time: fmt.clock(event.startTime) })}</span>
        </div>
      </div>

      <div className="hidden flex-col justify-center border-l-2 border-line md:flex">
        <DateBlock event={event} />
      </div>

      <div className="flex flex-row items-center justify-between gap-4 border-t-2 border-line p-5 md:flex-col md:items-stretch md:justify-center md:border-t-0 md:border-l-2 sm:p-6">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] tracking-[0.14em] text-fg-dim">
            {t("events.card.from")}
          </span>
          <span className="font-display text-2xl font-black tracking-[-0.02em] text-neon-yellow">
            {fmt.moneyWhole(event.fromPrice)}
          </span>
        </div>
        <div className="flex gap-2.5">
          <Button
            href={`/events/${event.slug}/register`}
            size="md"
            className="flex-1"
          >
            {t("events.card.register")}
          </Button>
          <SaveButton slug={event.slug} name={event.name} />
        </div>
      </div>
    </article>
  );
}

/** Compact card for the mobile rail and any grid layout. */
export function EventCardCompact({
  event,
  className,
}: {
  event: RunningEvent;
  className?: string;
}) {
  const t = useT();
  const fmt = useFormat();

  return (
    <article
      className={cn(
        "flex flex-col border-2 border-line bg-carbon transition-colors hover:border-line-strong",
        className,
      )}
    >
      <EventCover event={event} className="h-32">
        <SaveButton
          slug={event.slug}
          name={event.name}
          size="sm"
          className="absolute top-2.5 right-2.5"
        />
      </EventCover>
      <div className="flex flex-1 flex-col p-4">
        <div className="font-mono text-[10px] tracking-[0.14em] text-neon-lime">
          {event.dow} {event.day} {event.month} ·{" "}
          {distanceLabel(t, event.featuredDistance)}
        </div>
        <h3 className="mt-2 font-display text-xl leading-tight font-black uppercase">
          <Link
            href={`/events/${event.slug}`}
            className="transition-colors hover:text-neon-lime"
          >
            {event.name}
          </Link>
        </h3>
        <div className="mt-1.5 text-xs text-fg-dim">
          {event.city} ·{" "}
          {t("events.card.runners", { count: fmt.number(event.registered) })}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t-2 border-line pt-4">
          <span className="font-display text-lg font-black text-neon-yellow">
            {fmt.moneyWhole(event.fromPrice)}
          </span>
          <Button href={`/events/${event.slug}/register`} size="sm">
            {t("events.card.register")}
          </Button>
        </div>
      </div>
    </article>
  );
}

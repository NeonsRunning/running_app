"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Link } from "@/components/i18n/link";
import { useFormat, useT } from "@/components/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { DeleteEventButton } from "./delete-event-button";
import type {
  DashboardEvent,
  DashboardEventPage,
  DashboardStatus,
} from "@/lib/events/organizer";
import { domainLabel } from "@/lib/i18n/labels";

/**
 * The organizer's event cards. The first 24 come with the server render; the
 * rest load from `GET /api/organizer/events` as the end of the list nears.
 */

const STATUS_TONE: Record<DashboardStatus, "lime" | "outline" | "yellow" | "neutral"> = {
  Live: "lime",
  Draft: "outline",
  Closing: "yellow",
  Finished: "neutral",
};

/** Card actions share one shape so the row stays a single map. */
const ACTION_CLASS =
  "border-2 border-line-strong px-3 py-2 text-[11px] font-bold tracking-wider text-fg-muted uppercase transition-colors hover:border-neon-lime hover:text-neon-lime";

export function OrganizerEventList({
  initialPage,
}: {
  initialPage: DashboardEventPage;
}) {
  const t = useT();
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const events = page.events;
  const hasMore = events.length < page.total;

  function loadMore() {
    if (loading || !hasMore || failed) return;
    setLoading(true);
    fetch(`/api/organizer/events?offset=${events.length}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/organizer/events: ${res.status}`);
        const next = (await res.json()) as DashboardEventPage;
        setPage((p) => {
          const seen = new Set(p.events.map((e) => e.id));
          const merged = [...p.events, ...next.events.filter((e) => !seen.has(e.id))];
          // An empty page means events went since the count; stop here.
          return { events: merged, total: next.events.length ? next.total : merged.length };
        });
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  function removed(id: string) {
    setPage((p) => ({
      events: p.events.filter((e) => e.id !== id),
      total: p.total - 1,
    }));
  }

  // Load the next page while the end of the list is still a screen away.
  // Re-observed after each page, so a short page that leaves the sentinel in
  // view still asks for the one after it.
  const sentinel = useRef<HTMLDivElement>(null);
  const onSentinel = useEffectEvent(loadMore);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onSentinel();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, failed, events.length]);

  return (
    <>
      <ul className="mt-8 grid gap-5 lg:grid-cols-2" aria-busy={loading}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} onDeleted={() => removed(event.id)} />
        ))}
      </ul>

      <div ref={sentinel} aria-live="polite">
        {failed ? (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-sm text-fg-dim">{t("organizer.loadFailed")}</span>
            <Button variant="outline" size="sm" onClick={() => setFailed(false)}>
              {t("organizer.retry")}
            </Button>
          </div>
        ) : loading ? (
          <p className="mt-6 font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase">
            {t("organizer.loadingMore")}
          </p>
        ) : null}
      </div>
    </>
  );
}

function EventCard({
  event,
  onDeleted,
}: {
  event: DashboardEvent;
  onDeleted: () => void;
}) {
  const t = useT();
  const fmt = useFormat();

  return (
    <li className="border-2 border-line bg-carbon">
      <div className="flex items-start justify-between gap-4 border-b-2 border-line px-5 py-5">
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-black wrap-break-word uppercase">
            <Link
              href={`/organizer/events/${event.id}/edit`}
              className="hover:text-neon-lime"
            >
              {event.name}
            </Link>
          </h3>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
            {[
              event.date ? fmt.mediumDate(event.date) : t("organizer.noDate"),
              event.anywhere ? t("events.anywhere.short") : event.city,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge tone={STATUS_TONE[event.status]}>
          {domainLabel(t, "eventStatus", event.status)}
        </Badge>
      </div>

      <div className="px-5 py-5">
        {event.capacity > 0 ? (
          <Progress
            value={event.registered}
            max={event.capacity}
            label={t("organizer.runners")}
            tone={event.registered / event.capacity > 0.9 ? "yellow" : "lime"}
          />
        ) : null}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          <span className="text-fg-dim">
            {t("organizer.registeredOf", {
              registered: fmt.number(event.registered),
              capacity: fmt.number(event.capacity),
            })}
          </span>
          <span className="text-fg-dim">
            {t("organizer.revenueInline")}{" "}
            <b className="font-bold text-fg">{fmt.moneyWhole(event.revenue)}</b>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t-2 border-line px-5 py-4">
        <Link href={`/organizer/events/${event.id}/edit`} className={ACTION_CLASS}>
          {t("organizer.actions.edit")}
        </Link>
        {event.status !== "Draft" ? (
          <Link href={`/events/${event.slug}`} className={ACTION_CLASS}>
            {t("organizer.actions.view")}
          </Link>
        ) : null}
        {event.registered > 0 ? (
          <Link
            href={`/events/${event.slug}#registrations`}
            className={ACTION_CLASS}
          >
            {t("organizer.actions.registrations", {
              count: fmt.number(event.registered),
            })}
          </Link>
        ) : null}
        {/* Registrations hold an event in place; no point offering
            a delete the database will refuse. */}
        {event.registered === 0 ? (
          <DeleteEventButton
            id={event.id}
            name={event.name}
            live={event.status !== "Draft"}
            className={ACTION_CLASS}
            onDeleted={onDeleted}
          />
        ) : null}
      </div>
    </li>
  );
}

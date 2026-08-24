"use client";

import { EventCardCompact } from "@/components/events/event-card";
import { useSavedEvents } from "@/components/events/saved-events";
import { EmptyState } from "@/components/ui/misc";
import { useT } from "@/components/i18n/provider";
import type { RunningEvent } from "@/lib/types";

/** Saved events read from the favourites context, so hearts stay in sync. */
export function SavedEventsPanel({ events }: { events: RunningEvent[] }) {
  const { isSaved } = useSavedEvents();
  const t = useT();
  const saved = events.filter((e) => isSaved(e.slug));

  if (saved.length === 0) {
    return (
      <EmptyState
        icon="♡"
        title={t("saved.emptyTitle")}
        body={t("saved.emptyBody")}
        action={{ label: t("saved.browseRaces"), href: "/events" }}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {saved.map((event) => (
        <EventCardCompact key={event.id} event={event} />
      ))}
    </div>
  );
}

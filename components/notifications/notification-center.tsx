"use client";

import { Link } from "@/components/i18n/link";
import { useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import type { AppNotification } from "@/lib/types";

/** Dictionary keys, resolved at render against the active locale. */
const KIND_KEY: Record<AppNotification["kind"], string> = {
  reminder: "notifications.kind.reminder",
  confirmed: "notifications.kind.confirmed",
  results: "notifications.kind.results",
  update: "notifications.kind.update",
  social: "notifications.kind.social",
};

const KIND_TONE = {
  reminder: "yellow",
  confirmed: "green",
  results: "lime",
  update: "danger",
  social: "neutral",
} as const;

export function NotificationCenter({ initial }: { initial: AppNotification[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();

  const visible =
    filter === "unread" ? items.filter((n) => n.unread) : items;
  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b-2 border-line pb-7">
        <div>
          <Eyebrow>
            {t("notifications.unreadCount", { count: fmt.number(unreadCount) })}
          </Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
            {t("notifications.title")}
          </h1>
        </div>
        <Button
          variant="outline"
          size="md"
          disabled={unreadCount === 0}
          onClick={() => {
            setItems((list) => list.map((n) => ({ ...n, unread: false })));
            toast({ title: t("notifications.allCaughtUp"), tone: "info" });
          }}
        >
          {t("notifications.markAllRead")}
        </Button>
      </header>

      <SegmentedControl
        label={t("notifications.filter")}
        value={filter}
        onChange={setFilter}
        options={[
          {
            value: "all",
            label: t("notifications.all", {
              count: fmt.number(items.length),
            }),
          },
          {
            value: "unread",
            label: t("notifications.unread", {
              count: fmt.number(unreadCount),
            }),
          },
        ]}
        className="mt-6 sm:w-80"
      />

      {visible.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon="✓"
          title={t("notifications.emptyTitle")}
          body={t("notifications.emptyBody")}
          action={{
            label: t("notifications.findRace"),
            href: "/events",
          }}
        />
      ) : (
        <ul className="mt-8">
          {visible.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                onClick={() =>
                  setItems((list) =>
                    list.map((x) => (x.id === n.id ? { ...x, unread: false } : x)),
                  )
                }
                className={cn(
                  "flex gap-4 border-b-2 border-line px-2 py-5 transition-colors hover:bg-carbon",
                  n.unread && "bg-neon-lime/4",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-2 h-2.5 w-2.5 shrink-0",
                    n.unread ? "bg-neon-lime" : "bg-line-bright",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={KIND_TONE[n.kind]}>
                      {t(KIND_KEY[n.kind])}
                    </Badge>
                    <span className="font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                      {n.time}
                    </span>
                    {n.unread ? (
                      <span className="sr-only">
                        {t("notifications.unreadBadge")}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2.5 text-base font-extrabold">{n.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-dim">
                    {n.body}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

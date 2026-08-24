"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { HeartIcon } from "@/components/ui/icons";
import { useT } from "@/components/i18n/provider";

type SavedApi = {
  saved: Record<string, boolean>;
  isSaved: (id: string) => boolean;
  toggle: (id: string, name: string) => void;
  count: number;
};

const SavedContext = createContext<SavedApi | null>(null);

export function useSavedEvents(): SavedApi {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSavedEvents must be used inside <SavedEventsProvider>");
  return ctx;
}

export function SavedEventsProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Record<string, boolean>>({
    "condado-coastal-10k": true,
    "ponce-track-night-5k": true,
  });
  const { toast } = useToast();
  const t = useT();

  const toggle = useCallback(
    (id: string, name: string) => {
      setSaved((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        toast({
          title: next[id]
            ? t("events.save.savedTitle")
            : t("events.save.removedTitle"),
          body: next[id]
            ? t("events.save.savedBody", { name })
            : t("events.save.removedBody", { name }),
          tone: next[id] ? "success" : "info",
        });
        return next;
      });
    },
    [toast, t],
  );

  const value = useMemo<SavedApi>(
    () => ({
      saved,
      isSaved: (id: string) => Boolean(saved[id]),
      toggle,
      count: Object.values(saved).filter(Boolean).length,
    }),
    [saved, toggle],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

/**
 * Favourite toggle. The heart scales briefly on activation — the one piece of
 * decorative motion in the card, and it is disabled under reduced-motion.
 */
export function SaveButton({
  slug,
  name,
  size = "md",
  labelled = false,
  className,
}: {
  slug: string;
  name: string;
  size?: "sm" | "md";
  /** Renders a wide button with a written label, for the booking rail. */
  labelled?: boolean;
  className?: string;
}) {
  const { isSaved, toggle } = useSavedEvents();
  const t = useT();
  const on = isSaved(slug);

  return (
    <button
      type="button"
      onClick={() => toggle(slug, name)}
      aria-pressed={on}
      aria-label={
        labelled
          ? undefined
          : on
            ? t("events.save.unsaveAria", { name })
            : t("events.save.saveAria", { name })
      }
      className={cn(
        "group flex shrink-0 items-center justify-center gap-2.5 border-2 transition-colors duration-150",
        labelled
          ? "h-14 w-full text-[13px] font-extrabold tracking-[0.12em] uppercase"
          : size === "sm"
            ? "h-9 w-9"
            : "h-12 w-12",
        on
          ? "border-neon-yellow bg-neon-yellow/10 text-neon-yellow"
          : "border-line-strong bg-ink/60 text-fg-dim hover:border-fg-dim hover:text-fg",
        className,
      )}
    >
      <span
        className={cn(
          "flex transition-transform duration-200 ease-out",
          on ? "scale-110" : "group-hover:scale-110",
        )}
      >
        <HeartIcon filled={on} size={size === "sm" && !labelled ? 16 : 20} />
      </span>
      {labelled
        ? on
          ? t("events.save.savedLabel")
          : t("events.save.saveEvent")
        : null}
    </button>
  );
}

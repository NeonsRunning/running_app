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
import { NEXT_PARAM } from "@/lib/auth/routes";
import { setEventSavedAction } from "@/lib/events/saved";
import { useToast } from "@/components/ui/toast";
import { HeartIcon } from "@/components/ui/icons";
import { useT } from "@/components/i18n/provider";
import { useAppPathname, useLocalizedRouter } from "@/components/i18n/link";
import { useSession } from "@/components/layout/session";

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

/**
 * The runner's saved races, seeded from `saved_events` by the layout.
 *
 * A heart flips the moment it is pressed and the write follows; if the write
 * fails, the heart flips back and says so. Guests are sent to log in, and
 * come back to the page they were on.
 */
export function SavedEventsProvider({
  initial,
  children,
}: {
  /** Slugs saved when the layout rendered. Read once, on mount. */
  initial: string[];
  children: ReactNode;
}) {
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initial.map((slug) => [slug, true])),
  );
  const { toast } = useToast();
  const t = useT();
  const { signedIn } = useSession();
  const router = useLocalizedRouter();
  const pathname = useAppPathname();

  const toggle = useCallback(
    (id: string, name: string) => {
      if (!signedIn) {
        router.push(`/login?${NEXT_PARAM}=${encodeURIComponent(pathname)}`);
        return;
      }

      const next = !saved[id];
      setSaved((prev) => ({ ...prev, [id]: next }));
      toast({
        title: next
          ? t("events.save.savedTitle")
          : t("events.save.removedTitle"),
        body: next
          ? t("events.save.savedBody", { name })
          : t("events.save.removedBody", { name }),
        tone: next ? "success" : "info",
      });

      void setEventSavedAction(id, next)
        .catch(() => ({ ok: false }) as const)
        .then((result) => {
          if (result.ok) return;
          // Only undo if nothing has changed the heart since.
          setSaved((prev) => (prev[id] === next ? { ...prev, [id]: !next } : prev));
          toast({
            title: t("events.save.failedTitle"),
            body: t("events.save.failedBody", { name }),
            tone: "danger",
          });
        });
    },
    [saved, signedIn, router, pathname, toast, t],
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

"use client";

import { useT } from "@/components/i18n/provider";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "info" | "danger";

type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
};

type ToastApi = {
  toast: (t: { title: string; body?: string; tone?: ToastTone }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // A no-op fallback keeps components usable in isolation (tests, storybook).
  return ctx ?? { toast: () => {} };
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-neon-lime text-neon-lime",
  info: "border-line-bright text-fg",
  danger: "border-danger text-danger",
};

const TONE_ICON: Record<ToastTone, string> = {
  success: "✓",
  info: "i",
  danger: "!",
};

/**
 * How long a toast stays before dismissing itself. A danger toast says
 * something went wrong and what to do about it, so it stays until dismissed:
 * gone after a few seconds, it could vanish before it was read.
 */
const AUTO_DISMISS_MS: Record<ToastTone, number | null> = {
  success: 4800,
  info: 4800,
  danger: null,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  // Named `translate` because `t` is already the toast being rendered below.
  const translate = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    ({ title, body, tone = "success" }) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, title, body, tone }]);
      const after = AUTO_DISMISS_MS[tone];
      if (after !== null) window.setTimeout(() => dismiss(id), after);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Two live regions in one stack, both always mounted so a toast added
        to either is announced. Success and info are polite: read without
        interrupting the current task. Danger is an alert: read at once.
        Exempt from an open dialog's inert page (see Modal), so a toast
        raised from inside a dialog is still announced and dismissable.
      */}
      <div
        data-modal-exempt
        className="pointer-events-none fixed inset-x-4 bottom-4 z-90 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {(["polite", "assertive"] as const).map((live) => (
          <div
            key={live}
            role={live === "assertive" ? "alert" : undefined}
            aria-live={live}
            aria-atomic="false"
            className="flex w-full flex-col items-center gap-2 sm:items-end"
          >
            {toasts
              .filter((t) => (t.tone === "danger") === (live === "assertive"))
              .map((t) => (
                <ToastCard
                  key={t.id}
                  toast={t}
                  dismissLabel={translate("common.dismissNotification")}
                  onDismiss={() => dismiss(t.id)}
                />
              ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast: t,
  dismissLabel,
  onDismiss,
}: {
  toast: Toast;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 border-2 bg-charcoal px-4 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]",
        TONE_STYLES[t.tone],
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-current text-[11px] font-black"
      >
        {TONE_ICON[t.tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold tracking-wide text-fg uppercase">
          {t.title}
        </p>
        {t.body ? (
          <p className="mt-1 text-[13px] leading-snug text-fg-dim">{t.body}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-mt-1 -mr-1 shrink-0 px-2 py-1 text-fg-dim hover:text-fg"
      >
        ✕
      </button>
    </div>
  );
}

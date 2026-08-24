"use client";

import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";

/**
 * Share affordances. Uses the native share sheet where the browser offers one
 * and falls back to copying the URL, which is what most desktop users expect.
 */
export function ShareRow({
  title,
  path,
  className,
}: {
  title: string;
  path: string;
  className?: string;
}) {
  const { toast } = useToast();
  const t = useT();

  const url = () =>
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      toast({
        title: t("share.copiedTitle"),
        body: t("share.copiedBody"),
      });
    } catch {
      toast({
        title: t("share.failedTitle"),
        body: t("share.failedBody"),
        tone: "danger",
      });
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url: url() });
        return;
      } catch {
        // The user dismissed the sheet — nothing to report.
        return;
      }
    }
    void copy();
  }

  const cls =
    "flex-1 border-2 border-line-strong px-2 py-3 text-center font-mono text-[11px] uppercase tracking-wider text-fg-dim transition-colors hover:border-fg-dim hover:text-fg";

  return (
    <div className={className}>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={cls}>
          {t("share.copyLink")}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
        >
          WhatsApp
        </a>
        <button type="button" onClick={share} className={cls}>
          {t("share.share")}
        </button>
      </div>
    </div>
  );
}

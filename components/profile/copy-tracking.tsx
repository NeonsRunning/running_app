"use client";

import { useEffect, useState } from "react";

import { useT } from "@/components/i18n/provider";
import { useToast } from "@/components/ui/toast";

/**
 * A mailed kit's tracking number as a button: tapping it copies the number so
 * the runner can paste it into the carrier's tracking page.
 */
export function CopyTracking({ tracking }: { tracking: string }) {
  const t = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tracking);
      setCopied(true);
    } catch {
      toast({
        title: t("share.failedTitle"),
        body: t("share.failedBody"),
        tone: "danger",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={t("runner.copyTracking", { tracking })}
      className="group inline-flex max-w-full items-baseline gap-3 text-left"
    >
      <span
        translate="no"
        className="font-mono text-base font-bold break-all underline decoration-line-strong decoration-dotted underline-offset-4 transition-colors group-hover:decoration-fg-dim"
      >
        {tracking}
      </span>
      <span
        aria-live="polite"
        className={`shrink-0 font-mono text-[11px] tracking-wider uppercase transition-colors ${
          copied ? "text-neon-lime" : "text-fg-dim group-hover:text-fg"
        }`}
      >
        {copied ? t("runner.copied") : t("runner.copy")}
      </span>
    </button>
  );
}

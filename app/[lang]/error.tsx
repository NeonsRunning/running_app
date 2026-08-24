"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/provider";

/**
 * Route-level error boundary. Shows what went wrong, offers the one action
 * that usually fixes it, and never strands the user without a way out.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center border-2 border-danger text-3xl text-danger"
      >
        !
      </div>
      <h1 className="mt-8 font-display text-4xl font-black uppercase sm:text-5xl">
        {t("error.title")}
      </h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
        {t("error.body")}
      </p>
      {error.digest ? (
        <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
          {t("error.reference", { digest: error.digest })}
        </p>
      ) : null}
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={reset}>
          {t("error.tryAgain")}
        </Button>
        <Button href="/" variant="outline" size="lg">
          {t("error.backHome")}
        </Button>
        <Button href="/contact" variant="ghost" size="lg">
          {t("error.reportIt")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Link } from "@/components/i18n/link";
import { useT } from "@/components/i18n/provider";
import { useFormat, useLocale } from "@/components/i18n/provider";
import type { ReactNode } from "react";
import { BrandLock, BrandTagline } from "@/components/brand/logo";
import { Eyebrow } from "@/components/ui/badge";
import { signInWithGoogleAction } from "@/lib/auth/actions";

/**
 * Split auth layout: brand panel on the left at desktop widths, form on the
 * right. On phones the panel collapses to a compact header so the form is
 * above the fold.
 */
export function AuthShell({
  title,
  intro,
  children,
  footer,
  stats = true,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer?: ReactNode;
  stats?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.1fr_1fr]">
      {/* Brand panel --------------------------------------------------- */}
      <section className="relative overflow-hidden border-b-2 border-line lg:border-r-2 lg:border-b-0">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(140deg,#050505_0%,#050505_50%,#0d2207_76%,#245200_96%,#4f9c00_118%)]"
        />
        <div aria-hidden="true" className="bg-road-lines absolute inset-0" />
        <div
          aria-hidden="true"
          className="absolute -right-32 -bottom-40 hidden h-[30rem] w-[30rem] rounded-full border-2 border-neon-lime/30 lg:block"
        />

        <div className="relative flex h-full flex-col justify-between px-5 py-6 sm:px-8 lg:px-12 lg:py-14">
          <BrandLock />

          <div className="hidden lg:block">
            <BrandTagline />
            <p className="mt-6 max-w-md font-display text-5xl leading-[0.92] font-black tracking-[-0.035em] uppercase xl:text-6xl">
              {t("auth.shell.headlineLine1")}
              <br />
              {t("auth.shell.headlineLine2")}
              <br />
              <span className="text-neon-yellow">
                {t("auth.shell.headlineLine3")}
              </span>
            </p>
          </div>

          {stats ? (
            <dl className="mt-8 hidden gap-8 lg:flex">
              {[
                { v: fmt.number(184), l: t("auth.shell.statsRaces") },
                { v: fmt.number(26410), l: t("auth.shell.statsRunners") },
                { v: fmt.number(62), l: t("auth.shell.statsOrganizers") },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="sr-only">{s.l}</dt>
                  <dd>
                    <span className="block font-display text-3xl font-black">
                      {s.v}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
                      {s.l}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      {/* Form ---------------------------------------------------------- */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <Eyebrow>NEONS RUNNING</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-dim">{intro}</p>

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-8 border-t-2 border-line pt-6 text-sm text-fg-dim">
              {footer}
            </div>
          ) : null}

          <p className="mt-8 text-xs leading-relaxed text-fg-faint">
            {t("auth.shell.termsPre")}{" "}
            <Link href="/legal/terms" className="text-neon-lime underline">
              {t("auth.shell.termsLink")}
            </Link>{" "}
            {t("auth.shell.termsAnd")}{" "}
            <Link href="/legal/privacy" className="text-neon-lime underline">
              {t("auth.shell.privacyLink")}
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * Google sign-in, shared by login and sign-up.
 *
 * A form rather than an onClick: the redirect to Google is minted server-side,
 * where the PKCE verifier can be written to an http-only cookie for the
 * callback route to spend.
 */
export function SocialAuth({ next }: { next?: string }) {
  const t = useT();
  const locale = useLocale();

  return (
    <form action={signInWithGoogleAction} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        className="flex min-h-13 w-full cursor-pointer items-center justify-center gap-3 border-2 border-line-strong px-4 py-3.5 text-sm font-bold transition-colors hover:border-fg-dim"
      >
        <span aria-hidden="true" className="text-base">
          G
        </span>
        {t("auth.shell.continueWithGoogle")}
      </button>
    </form>
  );
}

export function AuthDivider() {
  const t = useT();

  return (
    <div className="my-7 flex items-center gap-4">
      <span className="h-0.5 flex-1 bg-line" />
      <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
        {t("auth.shell.orWithEmail")}
      </span>
      <span className="h-0.5 flex-1 bg-line" />
    </div>
  );
}

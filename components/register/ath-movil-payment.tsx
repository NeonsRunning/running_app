"use client";

import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormat, useT } from "@/components/i18n/provider";
import {
  MAX_REFERENCE_LENGTH,
  REVIEW_HOURS,
  athMovilPath,
  athMovilQrUrl,
} from "@/lib/ath-movil/config";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";
import type { AthMovilSubmission } from "@/lib/events/registrations";
import type { RunningEvent } from "@/lib/types";

/**
 * Paying with ATH Móvil: the instructions on the payment step, and the screen
 * a runner sees while an admin checks the payment by hand. See
 * `lib/ath-movil/config.ts` for how the pieces fit.
 */

export function AthMovilInstructions({
  amount,
  code,
  reference,
  onReferenceChange,
  error,
}: {
  /** What the database priced the sign-up at: the exact amount to send. */
  amount: number;
  code: string;
  reference: string;
  onReferenceChange: (value: string) => void;
  error?: string;
}) {
  const t = useT();
  const fmt = useFormat();
  const qr = athMovilQrUrl();
  const path = athMovilPath();

  return (
    <div className="border-2 border-line">
      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
        {qr ? (
          <div className="mx-auto w-48 shrink-0 bg-white p-3 sm:mx-0">
            {/* A file under public/ or any host: next/image would need the
                host configured as a remote pattern. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt={t("register.athMovil.qrAlt", { path })}
              width={168}
              height={168}
              className="block h-auto w-full"
            />
          </div>
        ) : null}
        <dl className="grid gap-4">
          <div>
            <dt>
              <Eyebrow>{t("register.athMovil.sendExactly")}</Eyebrow>
            </dt>
            <dd className="mt-1 font-display text-4xl font-black text-neon-yellow tabular-nums">
              {fmt.money(amount)}
            </dd>
          </div>
          <div>
            <dt>
              <Eyebrow>{t("register.athMovil.businessPath")}</Eyebrow>
            </dt>
            <dd translate="no" className="mt-1 font-mono text-xl font-bold">
              {path}
            </dd>
          </div>
          <div>
            <dt>
              <Eyebrow>{t("register.athMovil.yourCode")}</Eyebrow>
            </dt>
            <dd
              translate="no"
              className="mt-1 font-mono text-xl font-bold text-neon-lime"
            >
              {code}
            </dd>
          </div>
        </dl>
      </div>

      <ol className="grid list-none gap-4 border-t-2 border-line p-5 text-[15px] leading-relaxed text-fg-muted sm:p-7">
        {(
          [
            t(qr ? "register.athMovil.step1Qr" : "register.athMovil.step1", {
              path,
            }),
            t("register.athMovil.step2", { amount: fmt.money(amount) }),
            t("register.athMovil.step3", { code }),
            t("register.athMovil.step4"),
          ] as const
        ).map((text, i) => (
          <li key={i} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center bg-neon-lime font-mono text-[13px] font-bold text-ink"
            >
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="border-t-2 border-line p-5 sm:p-7">
        <Field
          label={t("register.athMovil.reference")}
          hint={t("register.athMovil.referenceHint")}
          error={error}
          className="max-w-sm"
        >
          {(p) => (
            <Input
              {...p}
              name="ath-movil-reference"
              value={reference}
              maxLength={MAX_REFERENCE_LENGTH}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("register.athMovil.referencePlaceholder")}
              onChange={(e) => onReferenceChange(e.target.value)}
            />
          )}
        </Field>
      </div>

      <p className="border-t-2 border-line bg-carbon p-5 text-[14px] leading-relaxed text-fg-muted sm:p-7">
        <strong className="text-fg">
          {t("register.athMovil.reviewTitle", { hours: REVIEW_HOURS })}
        </strong>{" "}
        {t("register.athMovil.reviewBody")}
      </p>
    </div>
  );
}

/** The register page once the runner has said they sent the money. */
export function AthMovilUnderReview({
  event,
  submission,
}: {
  event: RunningEvent;
  submission: AthMovilSubmission;
}) {
  const t = useT();
  const fmt = useFormat();

  return (
    <div className="mx-auto grid max-w-5xl items-start gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1fr_420px] lg:gap-12 lg:py-24">
      <section>
        <Badge tone="yellow">{t("register.athMovil.pendingBadge")}</Badge>
        <h1 className="mt-7 font-display text-5xl leading-[0.9] font-black tracking-[-0.03em] uppercase sm:text-6xl">
          {t("register.athMovil.pendingTitle")}
        </h1>
        <p className="mt-6 font-display text-2xl font-extrabold uppercase">
          {event.name}
        </p>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          {t("register.athMovil.pendingBody", {
            hours: REVIEW_HOURS,
            email: submission.email,
          })}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button href={`/events/${event.slug}`} size="lg">
            {t("register.backToEvent")}
          </Button>
          <Button href={SELF_PROFILE_PATH} variant="outline" size="lg">
            {t("account.profile")}
          </Button>
        </div>
      </section>

      <aside className="lg:mt-2">
        <dl className="border-2 border-line bg-carbon">
          {(
            [
              [t("register.athMovil.amountSent"), fmt.money(submission.amount)],
              [t("register.athMovil.reference"), submission.reference],
              [t("register.athMovil.yourCode"), submission.code],
              [t("register.athMovil.businessPath"), athMovilPath()],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b-2 border-line px-5 py-4 last:border-b-0"
            >
              <dt>
                <Eyebrow>{label}</Eyebrow>
              </dt>
              <dd translate="no" className="font-mono text-[15px] font-bold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[13px] leading-relaxed text-fg-dim">
          {t("register.athMovil.pendingHelp")}
        </p>
      </aside>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Link } from "@/components/i18n/link";
import { useLocale, useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  verifyEmailAction,
  type AuthState,
} from "@/lib/auth/actions";

/**
 * Auth forms.
 *
 * Every form posts to a server action, so the credentials never touch client
 * state and a submit works before React has hydrated. Two pieces of plumbing
 * repeat across all of them:
 *
 * - a hidden `locale` field, because server actions cannot read the locale
 *   from `next/root-params` the way server components can;
 * - errors that arrive as dictionary keys and are translated here, so the
 *   server never has to know which language the runner reads.
 */

/** The active locale, as a hidden field for the action to redirect against. */
function LocaleField() {
  const locale = useLocale();
  return <input type="hidden" name="locale" value={locale} />;
}

/** Whole-form failure — a rejected password, an expired link, a rate limit. */
function AuthAlert({ error }: { error?: string }) {
  const t = useT();
  if (!error) return null;

  return (
    <p
      role="alert"
      className="flex items-start gap-2 border-2 border-danger bg-danger/8 px-4 py-3 text-[13px] font-semibold text-danger"
    >
      <span aria-hidden="true">▲</span>
      {t(`auth.errors.${error}`)}
    </p>
  );
}

/** Translate a field error key against the calling form's own namespace. */
function useFieldError(namespace: string, state: AuthState | undefined) {
  const t = useT();
  return (field: string) => {
    const key = state?.fieldErrors?.[field];
    return key ? t(`${namespace}.${key}`) : undefined;
  };
}

export function LoginForm({
  next,
  notice,
}: {
  /** Where the proxy wanted the runner to land, preserved through login. */
  next?: string;
  /** A failure that happened before this page — a dead link, a refused consent. */
  notice?: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(signInAction, undefined);
  const fieldError = useFieldError("auth.login", state);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <LocaleField />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <AuthAlert error={state?.error ?? notice} />

      <Field label={t("auth.login.email")} error={fieldError("email")}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
          />
        )}
      </Field>

      <Field label={t("auth.login.password")} error={fieldError("password")}>
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <div className="flex items-center justify-end">
        <Link
          href="/forgot-password"
          className="text-[13px] font-bold text-neon-lime hover:underline"
        >
          {t("auth.login.forgotPassword")}
        </Link>
      </div>

      <Button type="submit" block size="xl" disabled={pending} aria-busy={pending}>
        {pending ? t("auth.login.signingIn") : t("auth.login.submit")}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const t = useT();
  const [state, action, pending] = useActionState(signUpAction, undefined);
  const fieldError = useFieldError("auth.signup", state);
  const [account, setAccount] = useState<"runner" | "organizer">("runner");

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <LocaleField />
      <input type="hidden" name="accountType" value={account} />

      <AuthAlert error={state?.error} />

      <fieldset>
        <legend className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
          {t("auth.signup.accountType")}
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup">
          {(
            [
              {
                v: "runner" as const,
                title: t("auth.signup.runner"),
                blurb: t("auth.signup.runnerBlurb"),
              },
              {
                v: "organizer" as const,
                title: t("auth.signup.organizer"),
                blurb: t("auth.signup.organizerBlurb"),
              },
            ]
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={account === o.v}
              onClick={() => setAccount(o.v)}
              className={cn(
                "border-2 px-4 py-4 text-left transition-colors",
                account === o.v
                  ? "border-neon-lime bg-neon-lime/8"
                  : "border-line-strong hover:border-fg-dim",
              )}
            >
              <span
                className={cn(
                  "block text-base font-extrabold uppercase",
                  account === o.v && "text-neon-lime",
                )}
              >
                {o.title}
              </span>
              <span className="mt-1 block text-xs text-fg-dim">{o.blurb}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-faint">
          {t("auth.signup.accountNote")}
        </p>
      </fieldset>

      <Field label={t("auth.signup.fullName")} error={fieldError("name")}>
        {(p) => (
          <Input {...p} name="name" autoComplete="name" placeholder="Alex Rivera" />
        )}
      </Field>

      <Field label={t("auth.login.email")} error={fieldError("email")}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
          />
        )}
      </Field>

      <Field
        label={t("auth.login.password")}
        error={fieldError("password")}
        hint={t("auth.signup.passwordHint")}
      >
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <Button type="submit" block size="xl" disabled={pending} aria-busy={pending}>
        {pending ? t("auth.signup.creating") : t("auth.signup.submit")}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    undefined,
  );
  const fieldError = useFieldError("auth.forgot", state);

  // The confirmation never says whether the address is registered — that
  // would turn this form into an account-lookup tool.
  if (state?.ok) {
    return (
      <div className="border-2 border-neon-lime bg-neon-lime/8 px-5 py-7">
        <p className="font-display text-2xl font-black text-neon-lime uppercase">
          {t("auth.forgot.sentTitle")}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t("auth.forgot.sentBody", { email: state.email ?? "" })}
        </p>
        <Button href="/login" variant="outline" size="md" className="mt-6">
          {t("auth.forgot.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <LocaleField />
      <AuthAlert error={state?.error} />

      <Field label={t("auth.login.email")} error={fieldError("email")}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
          />
        )}
      </Field>

      <Button type="submit" block size="xl" disabled={pending} aria-busy={pending}>
        {pending ? t("auth.forgot.sending") : t("auth.forgot.submit")}
      </Button>
    </form>
  );
}

/**
 * The new password, set from inside the session the recovery link opened.
 * Reaching this form without that session is what `sessionExpired` reports.
 */
export function ResetPasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState(updatePasswordAction, undefined);
  const fieldError = useFieldError("auth.reset", state);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <LocaleField />
      <AuthAlert error={state?.error} />

      <Field
        label={t("auth.reset.newPassword")}
        error={fieldError("password")}
        hint={t("auth.signup.passwordHint")}
      >
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <Field label={t("auth.reset.confirmPassword")} error={fieldError("confirm")}>
        {(p) => (
          <Input
            {...p}
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <Button type="submit" block size="xl" disabled={pending} aria-busy={pending}>
        {pending ? t("auth.reset.saving") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}

/**
 * Confirmation by six-digit code, for runners who would rather type than
 * follow the link in the email. Both routes end at the same place — the link
 * is handled by `app/[lang]/auth/confirm`.
 */
export function VerifyEmailPanel({ email }: { email?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(verifyEmailAction, undefined);
  const [resent, resendAction, resending] = useActionState(
    resendVerificationAction,
    undefined,
  );
  const [code, setCode] = useState("");
  const fieldError = useFieldError("auth.verify", state);

  // Without an address there is nothing to verify against: the runner opened
  // this page directly rather than arriving from sign-up.
  if (!email) {
    return (
      <div className="flex flex-col gap-5">
        <AuthAlert error="missingEmail" />
        <Button href="/signup" variant="outline" size="md">
          {t("auth.verify.footerLink")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6" noValidate>
        <LocaleField />
        <input type="hidden" name="email" value={email} />
        <AuthAlert error={state?.error} />

        <Field
          label={t("auth.verify.codeLabel")}
          hint={t("auth.verify.codeHint", { email })}
          error={fieldError("token")}
        >
          {(p) => (
            <Input
              {...p}
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="text-center font-mono text-3xl tracking-[0.4em]"
            />
          )}
        </Field>

        <Button
          type="submit"
          block
          size="xl"
          disabled={code.length !== 6 || pending}
          aria-busy={pending}
        >
          {pending ? t("auth.verify.verifying") : t("auth.verify.submit")}
        </Button>
      </form>

      <form action={resendAction}>
        <LocaleField />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={resending}
          className="text-[13px] font-bold text-neon-lime hover:underline disabled:opacity-40"
        >
          {resending ? t("auth.verify.resending") : t("auth.verify.resend")}
        </button>
        {resent?.ok ? (
          <p role="status" className="mt-2 text-[13px] text-fg-dim">
            {t("auth.verify.resentBody")}
          </p>
        ) : null}
        <AuthAlert error={resent?.error} />
      </form>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { Link } from "@/components/i18n/link";
import { useLocale, useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
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

      <Button
        type="submit"
        block
        size="xl"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("auth.login.signingIn") : t("auth.login.submit")}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const t = useT();
  const [state, action, pending] = useActionState(signUpAction, undefined);
  const fieldError = useFieldError("auth.signup", state);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <LocaleField />

      <AuthAlert error={state?.error} />

      <Field label={t("auth.signup.fullName")} error={fieldError("name")}>
        {(p) => (
          <Input
            {...p}
            name="name"
            autoComplete="name"
            placeholder="Alex Rivera"
          />
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

      <Button
        type="submit"
        block
        size="xl"
        disabled={pending}
        aria-busy={pending}
      >
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

      <Button
        type="submit"
        block
        size="xl"
        disabled={pending}
        aria-busy={pending}
      >
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
  const [state, action, pending] = useActionState(
    updatePasswordAction,
    undefined,
  );
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

      <Field
        label={t("auth.reset.confirmPassword")}
        error={fieldError("confirm")}
      >
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

      <Button
        type="submit"
        block
        size="xl"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("auth.reset.saving") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}

/** How long the resend button stays disabled after a message goes out. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * The screen a runner lands on straight after signing up.
 *
 * The confirmation email carries a link, not a code — it is spent at
 * `app/[lang]/auth/confirm`, in whichever browser opens the mail. So there is
 * nothing to type here: this panel names the inbox to look in and sends the
 * message again when it never arrived.
 */
export function VerifyEmailPanel({ email }: { email?: string }) {
  const t = useT();
  const [resent, resendAction, resending] = useActionState(
    resendVerificationAction,
    undefined,
  );
  // Supabase rate-limits repeat sends, and a refusal a runner cannot explain
  // reads as a broken button. The countdown starts on the submit itself
  // rather than on the reply, so the pause covers the round trip too.
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Without an address there is nothing to resend to: the runner opened this
  // page directly rather than arriving from sign-up.
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

  const waiting = cooldown > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-2 border-neon-lime bg-neon-lime/8 px-5 py-7">
        <p className="font-display text-2xl font-black text-neon-lime uppercase">
          {t("auth.verify.sentTitle")}
        </p>
        <p className="mt-3 text-sm leading-relaxed wrap-break-words text-fg-muted">
          {t("auth.verify.sentBody", { email })}
        </p>
      </div>

      <p className="text-[13px] leading-relaxed text-fg-dim">
        {t("auth.verify.spam")}
      </p>

      <form
        action={resendAction}
        onSubmit={() => setCooldown(RESEND_COOLDOWN_SECONDS)}
        className="flex flex-col gap-3"
      >
        <LocaleField />
        <input type="hidden" name="email" value={email} />
        <AuthAlert error={resent?.error} />

        <Button
          type="submit"
          block
          size="xl"
          variant="outline"
          disabled={resending || waiting}
          aria-busy={resending}
        >
          {resending
            ? t("auth.verify.resending")
            : waiting
              ? t("auth.verify.resendIn", { seconds: cooldown })
              : t("auth.verify.resend")}
        </Button>

        {/* Always mounted, so the confirmation is announced and not only seen:
            a live region that appears with its text can go unread. */}
        <p role="status" className="min-h-5 text-[13px] text-fg-dim">
          {resent?.ok ? t("auth.verify.resentBody") : ""}
        </p>
      </form>

      <Button href="/login" variant="ghost" size="md">
        {t("auth.verify.backToLogin")}
      </Button>
    </div>
  );
}

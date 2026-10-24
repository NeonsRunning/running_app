"use client";

import {
  useActionState,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/layout/session";
import { useLocaleTag, useT } from "@/components/i18n/provider";
import {
  cancelAccountDeletionAction,
  exportMyDataAction,
  requestAccountDeletionAction,
  setEmailPreferenceAction,
  setProfileVisibilityAction,
  updateMailingAddressAction,
  updateProfileAction,
  updateRaceDetailsAction,
  type ProfileState,
} from "@/lib/profile/actions";
import type { Profile, ProfileDetails } from "@/lib/profile/queries";
import { SHIRT_SIZES } from "@/lib/events/vocabulary";
import { PR_MUNICIPALITIES } from "@/lib/pr-municipalities";
import {
  ADDRESS_LIMITS,
  DEFAULT_STATE,
  US_STATES,
  type MailingAddress,
} from "@/lib/profile/address";
import { cn } from "@/lib/cn";

/**
 * The emails a runner can switch off, each a column on `profile_private`
 * (labels are keys under `settings.prefs`). Everything about money or a held
 * spot always goes, so it has no switch.
 */
const EMAIL_PREFS = ["reminders", "results", "updates"] as const;
type EmailPref = (typeof EMAIL_PREFS)[number];

/** One role on the account-type card: what it is, whether it is on, where it leads. */
function RoleRow({
  name,
  badge,
  detail,
  action,
}: {
  name: string;
  badge: ReactNode;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 p-6">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-extrabold uppercase">{name}</p>
          {badge}
        </div>
        <p className="mt-2 text-[13px] text-fg-dim">{detail}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b-2 border-line py-9 last:border-b-0">
      <h2 className="font-display text-2xl font-black uppercase">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-[15px] text-fg-dim">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function SettingsPanel({
  profile,
  details,
  deletion,
}: {
  profile: Profile | null;
  details: ProfileDetails | null;
  deletion: {
    /** When the runner asked for their account to be deleted; null if not. */
    requestedAt: string | null;
    /** Their sign-ups for races still to come, for the warning. */
    upcoming: number;
  };
}) {
  const session = useSession();
  const t = useT();

  return (
    <div className="max-w-4xl">

      <Section
        title={t("settings.profile")}
        description={t("settings.profileDescription")}
      >
        <ProfileForm profile={profile} email={session.email} />
      </Section>

      <Section
        title={t("settings.raceDetails")}
        description={t("settings.raceDetailsDescription")}
      >
        <RaceDetailsForm details={details} />
      </Section>

      <Section
        title={t("settings.mailingAddress")}
        description={t("settings.mailingAddressDescription")}
      >
        <MailingAddressForm address={details?.mailingAddress ?? null} />
      </Section>

      <Section
        title={t("settings.notifications")}
        description={t("settings.notificationsDescription")}
      >
        <ul className="border-t-2 border-line">
          {EMAIL_PREFS.map((pref) => (
            <EmailPrefSwitch
              key={pref}
              pref={pref}
              initial={details?.emailPrefs[pref] ?? true}
            />
          ))}
        </ul>
      </Section>

      <Section
        title={t("settings.accountType")}
        description={t("settings.accountTypeDescription")}
      >
        <ul className="divide-y-2 divide-line border-2 border-line bg-carbon">
          <RoleRow
            name={t("settings.runner")}
            badge={<Badge tone="lime">{t("settings.active")}</Badge>}
            detail={t("settings.runnerOn")}
          />
          <RoleRow
            name={t("settings.organizer")}
            badge={
              session.isOrganizer ? (
                <Badge tone="green">{t("settings.enabled")}</Badge>
              ) : (
                <Badge tone="outline">{t("settings.notEnabled")}</Badge>
              )
            }
            detail={
              session.isOrganizer
                ? t("settings.organizerOn")
                : t("settings.organizerOff")
            }
            action={
              session.isOrganizer ? (
                <Button href="/organizer" variant="outline" size="md">
                  {t("settings.organizerDashboard")}
                </Button>
              ) : (
                // Organizer access is granted by the team, in the database.
                <Button href="/contact" variant="outline" size="md">
                  {t("settings.requestOrganizer")}
                </Button>
              )
            }
          />
          {session.isAdmin ? (
            <RoleRow
              name={t("settings.admin")}
              badge={<Badge tone="yellow">{t("settings.enabled")}</Badge>}
              detail={t("settings.adminOn")}
              action={
                <Button href="/admin/payments" variant="outline" size="md">
                  {t("account.paymentReview")}
                </Button>
              }
            />
          ) : null}
        </ul>
      </Section>

      <Section title={t("settings.privacy")}>
        <PublicProfileToggle isPublic={profile?.isPublic ?? true} />
        <ExportData />
      </Section>

      <Section
        title={t("settings.dangerZone")}
        description={t("settings.dangerDescription")}
      >
        <DeleteAccount
          requestedAt={deletion.requestedAt}
          upcoming={deletion.upcoming}
          email={session.email}
        />
      </Section>
    </div>
  );
}

/**
 * One optional email, switched on or off. Written on change and rolled back
 * if the write fails, like the profile visibility switch.
 */
function EmailPrefSwitch({ pref, initial }: { pref: EmailPref; initial: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-6 border-b-2 border-line py-4">
      <div>
        <p className="text-[15px] font-bold">{t(`settings.prefs.${pref}`)}</p>
        <p className="mt-1 text-[13px] text-fg-dim">
          {t(`settings.prefs.${pref}Detail`)}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t(`settings.prefs.${pref}`)}
        aria-busy={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          startTransition(async () => {
            const result = await setEmailPreferenceAction(pref, next);
            if (!result.error) return;
            setOn(!next);
            toast({ title: t(`settings.errors.${result.error}`), tone: "danger" });
          });
        }}
        className={cn(
          "relative h-8 w-14 shrink-0 border-2 transition-colors",
          on ? "border-neon-lime bg-neon-lime/20" : "border-line-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-6 w-6 transition-[left]",
            on ? "left-[1.65rem] bg-neon-lime" : "left-0.5 bg-line-bright",
          )}
        />
      </button>
    </li>
  );
}

/**
 * Download everything the platform holds about the runner as a JSON file.
 * The server assembles it from the runner's own session; the browser saves it.
 */
function ExportData() {
  const t = useT();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6">
      <Button
        variant="outline"
        size="md"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await exportMyDataAction();
            if (!result.ok) {
              toast({ title: t(`settings.errors.${result.error}`), tone: "danger" });
              return;
            }
            const url = URL.createObjectURL(
              new Blob([result.json], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = result.filename;
            link.click();
            URL.revokeObjectURL(url);
          })
        }
      >
        {pending ? t("settings.exporting") : t("settings.exportData")}
      </Button>
      <p className="mt-2 max-w-2xl text-[13px] text-fg-dim">
        {t("settings.exportDetail")}
      </p>
    </div>
  );
}

/**
 * Asking for the account to be deleted. The team carries it out by hand —
 * paid registrations are payment records to keep or refund first — so this
 * files the request and, once filed, says so instead of offering it again.
 */
function DeleteAccount({
  requestedAt: initialRequestedAt,
  upcoming,
  email,
}: {
  requestedAt: string | null;
  upcoming: number;
  email: string;
}) {
  const t = useT();
  const localeTag = useLocaleTag();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [requestedAt, setRequestedAt] = useState(initialRequestedAt);
  const [pending, startTransition] = useTransition();

  if (requestedAt) {
    const date = new Intl.DateTimeFormat(localeTag, {
      dateStyle: "long",
      // Every date the app shows is the island's.
      timeZone: "America/Puerto_Rico",
    }).format(new Date(requestedAt));
    return (
      <div className="max-w-2xl">
        <p
          role="status"
          className="border-2 border-danger bg-danger/8 px-4 py-3 text-[14px] font-semibold"
        >
          {t("settings.deletionRequested", { date, email })}
        </p>
        <Button
          variant="outline"
          size="md"
          className="mt-4"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelAccountDeletionAction();
              if (!result.ok) {
                toast({ title: t(`settings.errors.${result.error}`), tone: "danger" });
                return;
              }
              setRequestedAt(null);
              toast({ title: t("settings.deletionCancelledTitle") });
            })
          }
        >
          {pending ? t("common.saving") : t("settings.cancelDeletion")}
        </Button>
      </div>
    );
  }

  const description =
    upcoming === 0
      ? t("settings.deleteDescriptionNone")
      : upcoming === 1
        ? t("settings.deleteDescriptionOne")
        : t("settings.deleteDescriptionMany", { count: upcoming });

  return (
    <>
      <Button
        variant="danger"
        size="lg"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("common.saving") : t("settings.deleteAccount")}
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await requestAccountDeletionAction();
            if (!result.ok) {
              toast({ title: t(`settings.errors.${result.error}`), tone: "danger" });
              return;
            }
            setRequestedAt(result.requestedAt);
            toast({
              title: t("settings.deletionRequestedTitle"),
              body: t("settings.deletionRequestedBody"),
            });
          })
        }
        title={t("settings.deleteTitle")}
        description={description}
        confirmLabel={t("settings.requestDeletion")}
        destructive
      />
    </>
  );
}

/**
 * The public half of the profile.
 *
 * Uncontrolled inputs posting to a server action: the row is written by the
 * session on the server, so nothing here has to hold a copy of it, and a
 * submit works before this component has hydrated.
 */
function ProfileForm({
  profile,
  email,
}: {
  profile: Profile | null;
  /** From the auth record, not the profile — changing it is an auth flow. */
  email: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [state, action, pending] = useActionState(updateProfileAction, undefined);

  useEffect(() => {
    if (!state?.ok) return;
    toast({ title: t("settings.profileSaved") });
    // `toast` and `t` are stable for the life of the panel; re-running on
    // their identity would fire the toast twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  const fieldError = (field: string) => {
    const key = state?.fieldErrors?.[field];
    return key ? t(`settings.errors.${key}`) : undefined;
  };

  // A city saved before it was a menu — or by a runner who has since moved off
  // the island — still has to be selectable, or saving the form would quietly
  // discard it.
  const municipalities: readonly string[] = PR_MUNICIPALITIES;
  const cities =
    profile?.city && !municipalities.includes(profile.city)
      ? [profile.city, ...municipalities]
      : municipalities;

  return (
    <form action={action} noValidate>
      {state?.error ? (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 border-2 border-danger bg-danger/8 px-4 py-3 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {t(`settings.errors.${state.error}`)}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("settings.fullName")} error={fieldError("name")}>
          {(p) => (
            <Input
              {...p}
              name="name"
              autoComplete="name"
              maxLength={80}
              defaultValue={profile?.name ?? ""}
            />
          )}
        </Field>

        <Field label={t("settings.email")} hint={t("settings.emailHint")}>
          {(p) => (
            <Input
              {...p}
              type="email"
              readOnly
              autoComplete="email"
              spellCheck={false}
              value={email}
              className="text-fg-dim"
            />
          )}
        </Field>

        <Field label={t("settings.city")} error={fieldError("city")} optional>
          {(p) => (
            <Select {...p} name="city" defaultValue={profile?.city ?? ""}>
              <option value="">{t("settings.cityPlaceholder")}</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("settings.club")} error={fieldError("club")} optional>
          {(p) => (
            <Input
              {...p}
              name="club"
              maxLength={80}
              defaultValue={profile?.club ?? ""}
              placeholder={t("settings.clubPlaceholder")}
            />
          )}
        </Field>

        <Field
          label={t("settings.bio")}
          error={fieldError("bio")}
          hint={t("settings.bioHint")}
          className="sm:col-span-2"
          optional
        >
          {(p) => (
            <Textarea
              {...p}
              name="bio"
              maxLength={280}
              defaultValue={profile?.bio ?? ""}
            />
          )}
        </Field>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-6"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("common.saving") : t("common.saveChanges")}
      </Button>
    </form>
  );
}

/**
 * The private half: what every race sign-up asks for, filled in once here and
 * pre-filled into each registration. Registering also writes it back, so a
 * runner who never opens this section still only types it the first time.
 */
function RaceDetailsForm({ details }: { details: ProfileDetails | null }) {
  const t = useT();
  const { toast } = useToast();
  const [state, action, pending] = useActionState(
    updateRaceDetailsAction,
    undefined,
  );

  useEffect(() => {
    if (!state?.ok) return;
    toast({ title: t("settings.raceDetailsSaved") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldError = (field: string) => {
    const key = state?.fieldErrors?.[field];
    return key ? t(`settings.errors.${key}`) : undefined;
  };

  return (
    <form action={action} noValidate>
      {state?.error ? (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 border-2 border-danger bg-danger/8 px-4 py-3 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {t(`settings.errors.${state.error}`)}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label={t("settings.birthDate")}
          error={fieldError("birthDate")}
          hint={t("settings.birthDateHint")}
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              name="birthDate"
              autoComplete="bday"
              defaultValue={details?.birthDate ?? ""}
            />
          )}
        </Field>

        <Field label={t("settings.gender")}>
          {(p) => (
            <Select {...p} name="gender" defaultValue={details?.gender ?? ""}>
              <option value="">{t("register.step2.genderUndisclosed")}</option>
              <option value="f">{t("register.step2.genderFemale")}</option>
              <option value="m">{t("register.step2.genderMale")}</option>
              <option value="x">{t("register.step2.genderOther")}</option>
            </Select>
          )}
        </Field>

        <Field
          label={t("settings.phone")}
          error={fieldError("phone")}
          hint={t("settings.phoneHint")}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              name="phone"
              autoComplete="tel"
              maxLength={20}
              defaultValue={details?.phone ?? ""}
            />
          )}
        </Field>

        <Field label={t("settings.shirtSize")} optional>
          {(p) => (
            <Select
              {...p}
              name="shirtSize"
              defaultValue={details?.shirtSize ?? ""}
            >
              <option value="">{t("settings.shirtSizePlaceholder")}</option>
              {SHIRT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="mt-8 grid gap-6 border-t-2 border-line pt-8 sm:grid-cols-2">
        <Field
          label={t("settings.emergencyName")}
          error={fieldError("emergencyName")}
        >
          {(p) => (
            <Input
              {...p}
              name="emergencyName"
              maxLength={80}
              defaultValue={details?.emergencyContactName ?? ""}
            />
          )}
        </Field>

        <Field
          label={t("settings.emergencyPhone")}
          error={fieldError("emergencyPhone")}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              name="emergencyPhone"
              maxLength={20}
              defaultValue={details?.emergencyContactPhone ?? ""}
            />
          )}
        </Field>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-6"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("common.saving") : t("common.saveChanges")}
      </Button>
    </form>
  );
}

/**
 * Where a medal goes when a registration picks "send by mail". Saved here
 * once, it fills in that step on every sign-up.
 *
 * Emptying every field and saving clears it.
 */
function MailingAddressForm({ address }: { address: MailingAddress | null }) {
  const t = useT();
  const { toast } = useToast();
  const [state, action, pending] = useActionState(
    updateMailingAddressAction,
    undefined,
  );

  useEffect(() => {
    if (!state?.ok) return;
    toast({ title: t("settings.mailingAddressSaved") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldError = (field: string) => {
    const key = state?.fieldErrors?.[field];
    return key ? t(`settings.errors.${key}`) : undefined;
  };

  return (
    <form action={action} noValidate>
      {state?.error ? (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 border-2 border-danger bg-danger/8 px-4 py-3 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {t(`settings.errors.${state.error}`)}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-6">
        <Field
          label={t("settings.addressLine1")}
          error={fieldError("addressLine1")}
          className="sm:col-span-6"
        >
          {(p) => (
            <Input
              {...p}
              name="addressLine1"
              autoComplete="shipping address-line1"
              maxLength={ADDRESS_LIMITS.line}
              placeholder={t("settings.addressLine1Placeholder")}
              defaultValue={address?.line1 ?? ""}
            />
          )}
        </Field>

        <Field
          label={t("settings.addressLine2")}
          error={fieldError("addressLine2")}
          optional
          className="sm:col-span-6"
        >
          {(p) => (
            <Input
              {...p}
              name="addressLine2"
              autoComplete="shipping address-line2"
              maxLength={ADDRESS_LIMITS.line}
              placeholder={t("settings.addressLine2Placeholder")}
              defaultValue={address?.line2 ?? ""}
            />
          )}
        </Field>

        <Field
          label={t("settings.addressCity")}
          error={fieldError("addressCity")}
          className="sm:col-span-3"
        >
          {(p) => (
            <Input
              {...p}
              name="addressCity"
              autoComplete="shipping address-level2"
              maxLength={ADDRESS_LIMITS.city}
              defaultValue={address?.city ?? ""}
            />
          )}
        </Field>

        <Field
          label={t("settings.addressState")}
          error={fieldError("addressState")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Select
              {...p}
              name="addressState"
              autoComplete="shipping address-level1"
              defaultValue={address?.state ?? DEFAULT_STATE}
            >
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={t("settings.addressPostalCode")}
          error={fieldError("addressPostalCode")}
          className="sm:col-span-1"
        >
          {(p) => (
            <Input
              {...p}
              name="addressPostalCode"
              inputMode="numeric"
              autoComplete="shipping postal-code"
              maxLength={10}
              placeholder="00901"
              defaultValue={address?.postalCode ?? ""}
            />
          )}
        </Field>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-6"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("common.saving") : t("common.saveChanges")}
      </Button>
    </form>
  );
}

/**
 * Hide the profile from other runners.
 *
 * The switch writes on change rather than waiting for a save button — a
 * privacy control someone forgets to save is worse than no control. The box
 * moves first and rolls back if the write fails, so the common case feels
 * immediate and the rare one is honest about what happened.
 */
function PublicProfileToggle({ isPublic }: { isPublic: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [checked, setChecked] = useState(isPublic);
  const [pending, startTransition] = useTransition();

  return (
    <Checkbox
      checked={checked}
      onChange={(event) => {
        const next = event.target.checked;
        const previous = checked;
        setChecked(next);

        startTransition(async () => {
          const result: ProfileState = await setProfileVisibilityAction(next);
          if (!result.error) return;

          setChecked(previous);
          toast({ title: t(`settings.errors.${result.error}`), tone: "danger" });
        });
      }}
      aria-busy={pending}
      label={
        <>
          <span className="font-bold">{t("settings.publicProfile")}</span>
          <span className="mt-1 block text-[13px] text-fg-dim">
            {t("settings.publicProfileDetail")}
          </span>
        </>
      }
    />
  );
}

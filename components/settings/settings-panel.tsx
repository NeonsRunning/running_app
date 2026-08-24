"use client";

import { useActionState, useEffect, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/layout/session";
import { useT } from "@/components/i18n/provider";
import { becomeOrganizerAction } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";

/** Labels are dictionary keys, resolved at render against the active locale. */
const NOTIFICATION_PREFS = [
  { id: "reminders", on: true },
  { id: "results", on: true },
  { id: "updates", on: true },
  { id: "openings", on: true },
  { id: "community", on: false },
  { id: "marketing", on: false },
];

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

export function SettingsPanel() {
  const session = useSession();
  const { toast } = useToast();
  const t = useT();
  const [prefs, setPrefs] = useState(
    Object.fromEntries(NOTIFICATION_PREFS.map((p) => [p.id, p.on])),
  );
  const [publicProfile, setPublicProfile] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>{t("settings.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("settings.title")}
        </h1>
      </header>

      <Section
        title={t("settings.profile")}
        description={t("settings.profileDescription")}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t("settings.fullName")}>
            {(p) => <Input {...p} defaultValue="Alex Rivera" />}
          </Field>
          <Field label={t("settings.email")}>
            {(p) => (
              <Input {...p} type="email" defaultValue="alex.rivera@email.com" />
            )}
          </Field>
          <Field label={t("settings.city")}>
            {(p) => <Input {...p} defaultValue="San Juan, Puerto Rico" />}
          </Field>
          <Field label={t("settings.club")} optional>
            {(p) => <Input {...p} defaultValue="Neons Nocturnos" />}
          </Field>
          <Field label={t("settings.bio")} className="sm:col-span-2">
            {(p) => (
              <Textarea
                {...p}
                defaultValue="Night-race specialist. Chasing a sub-45 10K before the year ends."
              />
            )}
          </Field>
        </div>
        <Button
          size="lg"
          className="mt-6"
          onClick={() => toast({ title: t("settings.profileSaved") })}
        >
          {t("common.saveChanges")}
        </Button>
      </Section>

      <Section
        title={t("settings.notifications")}
        description={t("settings.notificationsDescription")}
      >
        <ul className="border-t-2 border-line">
          {NOTIFICATION_PREFS.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-6 border-b-2 border-line py-4"
            >
              <div>
                <p className="text-[15px] font-bold">
                  {t(`settings.prefs.${p.id}`)}
                </p>
                <p className="mt-1 text-[13px] text-fg-dim">
                  {t(`settings.prefs.${p.id}Detail`)}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[p.id]}
                aria-label={t(`settings.prefs.${p.id}`)}
                onClick={() =>
                  setPrefs((v) => ({ ...v, [p.id]: !v[p.id] }))
                }
                className={cn(
                  "relative h-8 w-14 shrink-0 border-2 transition-colors",
                  prefs[p.id]
                    ? "border-neon-lime bg-neon-lime/20"
                    : "border-line-strong",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-0.5 h-6 w-6 transition-[left]",
                    prefs[p.id]
                      ? "left-[1.65rem] bg-neon-lime"
                      : "left-0.5 bg-line-bright",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={t("settings.accountType")}
        description={t("settings.accountTypeDescription")}
      >
        <div className="flex flex-wrap items-center gap-4 border-2 border-line bg-carbon p-6">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-base font-extrabold uppercase">
                {t("settings.runner")}
              </p>
              <Badge tone="lime">{t("settings.active")}</Badge>
              {session.isOrganizer ? (
                <>
                  <p className="text-base font-extrabold uppercase">
                    · {t("settings.organizer")}
                  </p>
                  <Badge tone="green">{t("settings.enabled")}</Badge>
                </>
              ) : null}
            </div>
            <p className="mt-2 text-[13px] text-fg-dim">
              {session.isOrganizer
                ? t("settings.organizerOn")
                : t("settings.organizerOff")}
            </p>
          </div>
          {session.isOrganizer ? (
            <Button href="/organizer" variant="outline" size="md">
              {t("settings.organizerDashboard")}
            </Button>
          ) : (
            <BecomeOrganizerButton />
          )}
        </div>
      </Section>

      <Section title={t("settings.privacy")}>
        <div className="flex flex-col gap-5">
          <Checkbox
            checked={publicProfile}
            onChange={(e) => setPublicProfile(e.target.checked)}
            label={
              <>
                <span className="font-bold">
                  {t("settings.publicProfile")}
                </span>
                <span className="mt-1 block text-[13px] text-fg-dim">
                  {t("settings.publicProfileDetail")}
                </span>
              </>
            }
          />
          <Checkbox
            defaultChecked
            label={
              <>
                <span className="font-bold">
                  {t("settings.showInLists")}
                </span>
                <span className="mt-1 block text-[13px] text-fg-dim">
                  {t("settings.showInListsDetail")}
                </span>
              </>
            }
          />
        </div>
        <Button
          variant="outline"
          size="md"
          className="mt-6"
          onClick={() =>
            toast({
              title: t("settings.exportTitle"),
              body: t("settings.exportBody"),
            })
          }
        >
          {t("settings.exportData")}
        </Button>
      </Section>

      <Section
        title={t("settings.dangerZone")}
        description={t("settings.dangerDescription")}
      >
        <Button variant="danger" size="lg" onClick={() => setConfirmDelete(true)}>
          {t("settings.deleteAccount")}
        </Button>
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          toast({
            title: t("settings.deletionScheduledTitle"),
            body: t("settings.deletionScheduledBody"),
            tone: "danger",
          })
        }
        title={t("settings.deleteTitle")}
        description={t("settings.deleteDescription")}
        confirmLabel={t("settings.deleteAccount")}
        destructive
      />
    </div>
  );
}

/**
 * Switching on the organizer tools writes to the user record, so it goes
 * through a server action; the layout re-renders with the new account type
 * and this button is replaced by the dashboard link.
 */
function BecomeOrganizerButton() {
  const t = useT();
  const { toast } = useToast();
  const [state, action, pending] = useActionState(
    becomeOrganizerAction,
    undefined,
  );

  useEffect(() => {
    if (!state?.ok) return;
    toast({
      title: t("settings.organizerEnabledTitle"),
      body: t("settings.organizerEnabledBody"),
    });
    // `toast` and `t` are stable for the life of the panel; re-running on
    // their identity would fire the toast twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  return (
    <form action={action}>
      <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
        {pending ? t("settings.enablingOrganizer") : t("settings.becomeOrganizer")}
      </Button>
    </form>
  );
}

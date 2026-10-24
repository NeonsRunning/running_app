"use client";

import { useState } from "react";

import { useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { setMedalDeliveryAction } from "@/lib/profile/medal-delivery";

/**
 * How a finisher medal reaches the runner, on their own profile: by mail to
 * an address, or picked up in person. Either can change until the medal is
 * handed over. A mailed medal without an address — the organizer turned the
 * mail on after the sign-up — opens on the address saved in settings.
 */
export function MedalDelivery({
  registrationId,
  byMail: initialByMail,
  address: initialAddress,
  fallback,
}: {
  registrationId: string;
  byMail: boolean;
  address: string | null;
  /** The settings address, offered when the medal has none yet. */
  fallback: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [byMail, setByMail] = useState(initialByMail);
  const [address, setAddress] = useState(initialAddress);
  const [editing, setEditing] = useState(false);
  const [draftByMail, setDraftByMail] = useState(initialByMail);
  const [draft, setDraft] = useState(initialAddress ?? fallback);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  function open(mail: boolean) {
    setDraftByMail(mail);
    setDraft(address ?? fallback);
    setInvalid(false);
    setEditing(true);
  }

  async function save() {
    if (draftByMail && !draft.trim()) {
      setInvalid(true);
      return;
    }
    setSaving(true);
    const result = await setMedalDeliveryAction(registrationId, draftByMail, draft).catch(
      () => ({ ok: false, error: "saveFailed" }) as const,
    );
    setSaving(false);

    if (result.ok) {
      setByMail(result.byMail);
      setAddress(result.address);
      setEditing(false);
      toast({
        title: t(result.byMail ? "runner.medalMailSaved" : "runner.medalPickupSaved"),
      });
    } else if (result.error === "addressInvalid") {
      setInvalid(true);
    } else {
      toast({
        title: t("runner.medalDeliveryErrors.title"),
        body: t(`runner.medalDeliveryErrors.${result.error}`),
        tone: "danger",
      });
    }
  }

  if (editing) {
    return (
      <form
        className="mt-3 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div
          role="radiogroup"
          aria-label={t("runner.medalDelivery")}
          className="flex flex-wrap gap-2"
        >
          {[true, false].map((mail) => (
            <button
              key={String(mail)}
              type="button"
              role="radio"
              aria-checked={draftByMail === mail}
              onClick={() => {
                setDraftByMail(mail);
                setInvalid(false);
              }}
              className={cn(
                "border-2 px-4 py-2.5 text-[13px] font-bold",
                draftByMail === mail
                  ? "border-neon-lime bg-neon-lime text-ink"
                  : "border-line-strong text-fg-muted hover:border-fg-dim",
              )}
            >
              {t(mail ? "runner.medalByMail" : "runner.medalPickup")}
            </button>
          ))}
        </div>
        {draftByMail ? (
          <Field
            label={t("runner.medalAddress")}
            hint={t("register.step3.mailingAddressHint")}
            error={invalid ? t("register.step3.mailingAddressRequired") : undefined}
            className="mt-4"
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                maxLength={300}
                autoComplete="shipping street-address"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value.trim()) setInvalid(false);
                }}
                className="min-h-24"
              />
            )}
          </Field>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button type="submit" size="sm" disabled={saving} aria-busy={saving}>
            {saving ? t("common.saving") : t("common.saveChanges")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  const link =
    "mt-2 text-[12px] font-extrabold tracking-[0.12em] text-neon-lime uppercase hover:text-neon-yellow";

  if (!byMail) {
    return (
      <div className="mt-3">
        <p className="max-w-[60ch] text-[14px] text-fg-muted">{t("runner.medalPickupBody")}</p>
        <button type="button" onClick={() => open(true)} className={link}>
          {t("runner.switchToMail")} →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {address ? (
        <p className="max-w-[60ch] text-[14px] whitespace-pre-line text-fg-muted">
          {t("runner.medalMailTo", { address })}
        </p>
      ) : (
        <p className="max-w-[60ch] text-[14px] text-neon-yellow">
          {t("runner.medalAddressMissing")}
        </p>
      )}
      <button type="button" onClick={() => open(true)} className={link}>
        {t(address ? "runner.changeMedalDelivery" : "runner.addMedalAddress")} →
      </button>
    </div>
  );
}

"use client";

import { Link } from "@/components/i18n/link";
import { useMemo, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import type { Translate } from "@/lib/i18n/translate";
import type { Formatters } from "@/lib/i18n/format";
import { distanceLabel, waveLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { RunningEvent } from "@/lib/types";

/**
 * Five-step registration: race → runner → extras → payment → confirmation.
 *
 * The whole flow is one client component holding its own state. Nothing is
 * persisted and no card is charged, so step 4 stands in for the gateway
 * round-trip with a timer. The runner fields open pre-filled with the demo
 * account, so the flow can be walked end to end without typing.
 */
const STEPS = [
  { n: 1, key: "register.steps.race" },
  { n: 2, key: "register.steps.runner" },
  { n: 3, key: "register.steps.extras" },
  { n: 4, key: "register.steps.payment" },
  { n: 5, key: "register.steps.done" },
] as const;

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const DONATIONS = [0, 5, 10, 25] as const;
const SERVICE_FEE = 2.9;
const SHIRT_PRICE = 22;
const PHOTO_PRICE = 12;

type Runner = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  club: string;
};

type Errors = Partial<Record<keyof Runner, string>>;

const EMPTY_ERRORS: Errors = {};

/** Messages come from the dictionary so validation speaks the reader's language. */
function validateRunner(r: Runner, t: Translate): Errors {
  const e: Errors = {};
  if (!r.firstName.trim()) e.firstName = t("register.errors.firstName");
  if (!r.lastName.trim()) e.lastName = t("register.errors.lastName");
  if (!r.email.trim()) e.email = t("register.errors.email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
    e.email = t("register.errors.emailInvalid");
  if (!r.phone.trim()) e.phone = t("register.errors.phone");
  if (!r.dob) e.dob = t("register.errors.dob");
  if (!r.emergencyName.trim())
    e.emergencyName = t("register.errors.emergencyName");
  if (!r.emergencyPhone.trim())
    e.emergencyPhone = t("register.errors.emergencyPhone");
  return e;
}

export function RegistrationFlow({ event }: { event: RunningEvent }) {
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();

  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState(
    event.categories.find((c) => c.name === event.featuredDistance)?.id ??
      event.categories[0].id,
  );
  const [waiver, setWaiver] = useState(false);
  const [waiverError, setWaiverError] = useState(false);
  const [runner, setRunner] = useState<Runner>({
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex.rivera@email.com",
    phone: "+1 787 555 0148",
    dob: "1994-03-18",
    gender: "male",
    emergencyName: "Marisol Rivera",
    emergencyPhone: "+1 787 555 0902",
    club: "Neons Nocturnos",
  });
  const [errors, setErrors] = useState<Errors>(EMPTY_ERRORS);
  const [wantsShirt, setWantsShirt] = useState(true);
  const [shirtSize, setShirtSize] = useState<string>("M");
  const [wantsPhotos, setWantsPhotos] = useState(false);
  const [donation, setDonation] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);

  const category =
    event.categories.find((c) => c.id === categoryId) ?? event.categories[0];

  const total = useMemo(() => {
    return (
      category.price +
      (wantsShirt ? SHIRT_PRICE : 0) +
      (wantsPhotos ? PHOTO_PRICE : 0) +
      donation +
      SERVICE_FEE
    );
  }, [category.price, wantsShirt, wantsPhotos, donation]);

  const done = step === 5;

  function goNext() {
    if (step === 1) {
      if (!waiver) {
        setWaiverError(true);
        return;
      }
      setWaiverError(false);
    }
    if (step === 2) {
      const found = validateRunner(runner, t);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        toast({
          title: t("register.errors.toastTitle"),
          body: t("register.errors.toastBody"),
          tone: "danger",
        });
        return;
      }
    }
    if (step === 4) {
      setSubmitting(true);
      // Stand-in for the payment round-trip.
      window.setTimeout(() => {
        setSubmitting(false);
        setStep(5);
        toast({
          title: t("register.confirmToastTitle"),
          body: t("register.confirmToastBody", { event: event.name }),
        });
      }, 900);
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  }

  if (done) {
    return (
      <Confirmation
        event={event}
        category={category.name}
        total={total}
        t={t}
        fmt={fmt}
      />
    );
  }

  return (
    <div className="pb-28 lg:pb-0">
      {/* Flow header ---------------------------------------------------- */}
      <header className="sticky top-0 z-60 border-b-2 border-line bg-ink">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
          <Link
            href={`/events/${event.slug}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-line-strong text-fg-dim hover:border-fg-dim hover:text-fg"
            aria-label={t("register.backToEvent")}
          >
            ←
          </Link>
          <div className="min-w-0">
            <Eyebrow>
              {t("register.stepOf", {
                step,
                label: t(STEPS[step - 1].key),
              })}
            </Eyebrow>
            <p className="mt-0.5 truncate text-[15px] font-extrabold uppercase">
              {event.name}
            </p>
          </div>
          <div className="flex-1" />
          <Link
            href={`/events/${event.slug}`}
            className="hidden font-mono text-[12px] tracking-[0.14em] text-fg-dim uppercase hover:text-fg sm:block"
          >
            {t("register.saveExit")}
          </Link>
        </div>

        {/* Mobile progress bars */}
        <div className="flex gap-1 px-4 pb-3 sm:px-6 lg:hidden">
          {STEPS.map((s) => (
            <span
              key={s.n}
              className={cn(
                "h-1.5 flex-1",
                step >= s.n ? "bg-neon-lime" : "bg-line",
              )}
            />
          ))}
        </div>
      </header>

      {/* Desktop step nav ------------------------------------------------ */}
      <nav
        aria-label={t("register.stepNav")}
        className="mx-auto hidden max-w-[1600px] grid-cols-5 border-b-2 border-line lg:grid"
      >
        {STEPS.map((s) => {
          const active = s.n === step;
          const past = s.n < step;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => s.n < step && setStep(s.n)}
              disabled={s.n > step}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex flex-col items-start gap-1.5 border-r-2 border-line px-6 py-5 text-left last:border-r-0",
                active
                  ? "bg-neon-lime text-ink"
                  : past
                    ? "text-fg hover:bg-carbon"
                    : "text-fg-faint",
              )}
            >
              <span className="font-mono text-[11px] tracking-[0.18em] opacity-75">
                0{s.n}
              </span>
              <span className="text-[15px] font-extrabold tracking-[0.1em] uppercase">
                {t(s.key)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[1fr_400px]">
        <main className="border-line px-4 py-8 sm:px-8 lg:min-h-[42rem] lg:border-r-2 lg:px-10 lg:py-12">
          {step === 1 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step1.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t("register.step1.body")}
              </p>

              <div
                role="radiogroup"
                aria-label={t("register.step1.categoryGroup")}
                className="mt-8 flex flex-col gap-0.5 border-2 border-line bg-line"
              >
                {event.categories.map((c) => {
                  const on = c.id === categoryId;
                  const full = c.registered >= c.capacity;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={full}
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "flex items-center justify-between gap-5 px-5 py-6 text-left transition-colors sm:px-7",
                        full
                          ? "cursor-not-allowed bg-ink opacity-40"
                          : on
                            ? "bg-neon-lime/10 text-neon-lime"
                            : "bg-ink hover:bg-carbon",
                      )}
                    >
                      <span className="flex items-center gap-4 sm:gap-5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-5 w-5 shrink-0 border-2",
                            on
                              ? "border-neon-lime bg-neon-lime"
                              : "border-line-bright",
                          )}
                        />
                        <span>
                          <span className="block font-display text-2xl font-black uppercase sm:text-3xl">
                            {distanceLabel(t, c.name)}
                          </span>
                          <span className="mt-1 block font-mono text-[11px] tracking-[0.14em] text-fg-dim uppercase">
                            {t("register.step1.categoryMeta", {
                              time: fmt.clock(c.startTime),
                              wave: waveLabel(t, c.wave),
                              km: fmt.number(c.distanceKm),
                            })}
                          </span>
                        </span>
                      </span>
                      <span className="font-display text-2xl font-black sm:text-3xl">
                        {fmt.moneyWhole(c.price)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  "mt-7 border-2 p-5",
                  waiverError ? "border-danger" : "border-line",
                )}
              >
                <Checkbox
                  checked={waiver}
                  onChange={(e) => {
                    setWaiver(e.target.checked);
                    if (e.target.checked) setWaiverError(false);
                  }}
                  label={
                    <>
                      {t("register.step1.waiverPre")}{" "}
                      <Link
                        href="/legal/terms"
                        className="text-neon-lime underline underline-offset-2"
                      >
                        {t("register.step1.waiverLink")}
                      </Link>{" "}
                      {t("register.step1.waiverPost")}
                    </>
                  }
                />
                {waiverError ? (
                  <p role="alert" className="mt-3 text-[13px] font-semibold text-danger">
                    {t("register.step1.waiverError")}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step2.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t("register.step2.body")}
              </p>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <Field
                  label={t("register.step2.firstName")}
                  error={errors.firstName}
                >
                  {(p) => (
                    <Input
                      {...p}
                      value={runner.firstName}
                      autoComplete="given-name"
                      onChange={(e) =>
                        setRunner({ ...runner, firstName: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t("register.step2.lastName")}
                  error={errors.lastName}
                >
                  {(p) => (
                    <Input
                      {...p}
                      value={runner.lastName}
                      autoComplete="family-name"
                      onChange={(e) =>
                        setRunner({ ...runner, lastName: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.email")} error={errors.email}>
                  {(p) => (
                    <Input
                      {...p}
                      type="email"
                      inputMode="email"
                      value={runner.email}
                      autoComplete="email"
                      onChange={(e) =>
                        setRunner({ ...runner, email: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.phone")} error={errors.phone}>
                  {(p) => (
                    <Input
                      {...p}
                      type="tel"
                      inputMode="tel"
                      value={runner.phone}
                      autoComplete="tel"
                      onChange={(e) =>
                        setRunner({ ...runner, phone: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.dob")} error={errors.dob}>
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={runner.dob}
                      autoComplete="bday"
                      onChange={(e) =>
                        setRunner({ ...runner, dob: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.gender")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={runner.gender}
                      onChange={(e) =>
                        setRunner({ ...runner, gender: e.target.value })
                      }
                    >
                      <option value="female">
                        {t("register.step2.genderFemale")}
                      </option>
                      <option value="male">
                        {t("register.step2.genderMale")}
                      </option>
                      <option value="other">
                        {t("register.step2.genderOther")}
                      </option>
                      <option value="undisclosed">
                        {t("register.step2.genderUndisclosed")}
                      </option>
                    </Select>
                  )}
                </Field>
              </div>

              <div className="mt-9 grid gap-6 border-t-2 border-line pt-8 sm:grid-cols-2">
                <Field
                  label={t("register.step2.emergencyName")}
                  error={errors.emergencyName}
                >
                  {(p) => (
                    <Input
                      {...p}
                      value={runner.emergencyName}
                      onChange={(e) =>
                        setRunner({ ...runner, emergencyName: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t("register.step2.emergencyPhone")}
                  error={errors.emergencyPhone}
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="tel"
                      value={runner.emergencyPhone}
                      onChange={(e) =>
                        setRunner({ ...runner, emergencyPhone: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t("register.step2.club")}
                  optional
                  className="sm:col-span-2"
                >
                  {(p) => (
                    <Input
                      {...p}
                      value={runner.club}
                      onChange={(e) =>
                        setRunner({ ...runner, club: e.target.value })
                      }
                    />
                  )}
                </Field>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step3.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t("register.step3.body")}
              </p>

              <div className="mt-8 border-2 border-line">
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <h2 className="font-display text-xl font-black uppercase">
                        {t("register.step3.shirt")}
                      </h2>
                      <p className="mt-1.5 text-sm text-fg-dim">
                        {t("register.step3.shirtDetail")}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-display text-xl font-black text-neon-yellow">
                        +{fmt.moneyWhole(SHIRT_PRICE)}
                      </span>
                      <Checkbox
                        checked={wantsShirt}
                        onChange={(e) => setWantsShirt(e.target.checked)}
                        label={
                          <span className="sr-only">
                            {t("register.step3.addShirt")}
                          </span>
                        }
                      />
                    </div>
                  </div>
                  {wantsShirt ? (
                    <div
                      role="radiogroup"
                      aria-label={t("register.step3.shirtSize")}
                      className="mt-5 flex flex-wrap gap-2"
                    >
                      {SHIRT_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={shirtSize === s}
                          onClick={() => setShirtSize(s)}
                          className={cn(
                            "min-w-14 border-2 px-3 py-3 text-[13px] font-bold",
                            shirtSize === s
                              ? "border-neon-lime bg-neon-lime text-ink"
                              : "border-line-strong text-fg-muted hover:border-fg-dim",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-5 border-t-2 border-line p-5 sm:p-7">
                  <div>
                    <h2 className="font-display text-xl font-black uppercase">
                      {t("register.step3.photos")}
                    </h2>
                    <p className="mt-1.5 text-sm text-fg-dim">
                      {t("register.step3.photosDetail")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-xl font-black text-neon-yellow">
                      +{fmt.moneyWhole(PHOTO_PRICE)}
                    </span>
                    <Checkbox
                      checked={wantsPhotos}
                      onChange={(e) => setWantsPhotos(e.target.checked)}
                      label={
                        <span className="sr-only">
                          {t("register.step3.addPhotos")}
                        </span>
                      }
                    />
                  </div>
                </div>

                <div className="border-t-2 border-line p-5 sm:p-7">
                  <h2 className="font-display text-xl font-black uppercase">
                    {t("register.step3.donate")}
                  </h2>
                  <p className="mt-1.5 text-sm text-fg-dim">
                    {t("register.step3.donateDetail")}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={t("register.step3.donationAmount")}
                    className="mt-5 flex flex-wrap gap-2"
                  >
                    {DONATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={donation === d}
                        onClick={() => setDonation(d)}
                        className={cn(
                          "min-w-16 border-2 px-4 py-3 text-sm font-bold",
                          donation === d
                            ? "border-neon-lime bg-neon-lime text-ink"
                            : "border-line-strong text-fg-muted hover:border-fg-dim",
                        )}
                      >
                        {fmt.moneyWhole(d)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step4.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t("register.step4.body")}
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                {[t("register.step4.methodCard"), "Apple Pay", "Google Pay"].map(
                  (m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={i === 0}
                    className={cn(
                      "flex-1 border-2 px-4 py-4 text-[13px] font-extrabold tracking-[0.12em] uppercase",
                      i === 0
                        ? "border-neon-lime bg-neon-lime/8 text-neon-lime"
                        : "border-line-strong text-fg-muted hover:border-fg-dim",
                    )}
                  >
                    {m}
                  </button>
                  ),
                )}
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <Field
                  label={t("register.step4.cardNumber")}
                  className="sm:col-span-2"
                >
                  {(p) => (
                    <Input
                      {...p}
                      defaultValue="4242 4242 4242 4242"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      className="font-mono"
                    />
                  )}
                </Field>
                <Field label={t("register.step4.expiry")}>
                  {(p) => (
                    <Input
                      {...p}
                      defaultValue="09 / 29"
                      autoComplete="cc-exp"
                      className="font-mono"
                    />
                  )}
                </Field>
                <Field label={t("register.step4.cvc")}>
                  {(p) => (
                    <Input
                      {...p}
                      defaultValue="•••"
                      autoComplete="cc-csc"
                      className="font-mono"
                    />
                  )}
                </Field>
                <Field
                  label={t("register.step4.nameOnCard")}
                  className="sm:col-span-2"
                >
                  {(p) => (
                    <Input
                      {...p}
                      defaultValue={`${runner.firstName} ${runner.lastName}`}
                      autoComplete="cc-name"
                    />
                  )}
                </Field>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder={t("register.step4.promoCode")}
                  aria-label={t("register.step4.promoCode")}
                />
                <Button variant="outline" size="lg" className="shrink-0">
                  {t("register.step4.apply")}
                </Button>
              </div>
            </section>
          ) : null}
        </main>

        {/* Order summary --------------------------------------------------- */}
        <aside className="border-t-2 border-line lg:border-t-0">
          <div className="lg:sticky lg:top-32">
            <div className="border-b-2 border-line px-5 py-7 sm:px-7">
              <Eyebrow>{t("register.summary.title")}</Eyebrow>
              <dl className="mt-5">
                <SummaryRow
                  label={t("register.summary.registration", {
                    category: distanceLabel(t, category.name),
                  })}
                  value={fmt.money(category.price)}
                />
                {wantsShirt ? (
                  <SummaryRow
                    label={t("register.summary.shirt", { size: shirtSize })}
                    value={fmt.money(SHIRT_PRICE)}
                  />
                ) : null}
                {wantsPhotos ? (
                  <SummaryRow
                    label={t("register.summary.photos")}
                    value={fmt.money(PHOTO_PRICE)}
                  />
                ) : null}
                {donation > 0 ? (
                  <SummaryRow
                    label={t("register.summary.donation")}
                    value={fmt.money(donation)}
                  />
                ) : null}
                <SummaryRow
                  label={t("register.summary.serviceFee")}
                  value={fmt.money(SERVICE_FEE)}
                  muted
                />
              </dl>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-[15px] font-extrabold tracking-[0.12em] uppercase">
                  {t("register.summary.total")}
                </span>
                <span className="font-display text-4xl font-black tracking-[-0.03em] text-neon-yellow">
                  {fmt.money(total)}
                </span>
              </div>
            </div>

            <div className="hidden px-5 py-7 sm:px-7 lg:block">
              <Button
                block
                size="xl"
                onClick={goNext}
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting
                  ? t("register.summary.processing")
                  : step === 4
                    ? t("register.summary.complete")
                    : t("register.summary.continue")}
              </Button>
              {step > 1 ? (
                <Button
                  block
                  variant="outline"
                  size="lg"
                  className="mt-3"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                >
                  {t("register.summary.back")}
                </Button>
              ) : null}
              <p className="mt-5 text-xs leading-relaxed text-fg-faint">
                {t("register.summary.refundPre")}{" "}
                <Link href="/legal/refunds" className="text-neon-lime underline">
                  {t("register.summary.refundLink")}
                </Link>
                .
              </p>
            </div>

            <div className="border-t-2 border-line bg-carbon px-5 py-6 sm:px-7">
              <Eyebrow>{t("register.summary.raceDay")}</Eyebrow>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                {fmt.longDate(event.date)}
                <br />
                {fmt.clock(category.startTime)} · {event.venue}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky mobile action bar --------------------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-60 grid grid-cols-[auto_1fr] items-center border-t-2 border-line bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="px-4 py-2">
          <Eyebrow className="text-[9px]">
            {t("register.summary.total")}
          </Eyebrow>
          <p className="font-display text-xl font-black text-neon-yellow">
            {fmt.money(total)}
          </p>
        </div>
        <div className="flex">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="min-h-14 border-l-2 border-line px-5 text-xs font-bold tracking-wider text-fg-dim uppercase"
            >
              {t("register.summary.back")}
            </button>
          ) : null}
          <Button
            size="lg"
            onClick={goNext}
            disabled={submitting}
            aria-busy={submitting}
            className="min-h-14 flex-1 rounded-none"
          >
            {submitting
              ? t("register.summary.processing")
              : step === 4
                ? t("register.summary.completeShort")
                : t("register.summary.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between border-b-2 border-line py-3.5 text-[15px]",
        muted && "text-fg-dim",
      )}
    >
      <dt>{label}</dt>
      <dd className={muted ? "" : "font-bold"}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Confirmation                                                         */
/* -------------------------------------------------------------------- */

function Confirmation({
  event,
  category,
  total,
  t,
  fmt,
}: {
  event: RunningEvent;
  category: string;
  total: number;
  t: Translate;
  fmt: Formatters;
}) {
  const categoryName = distanceLabel(t, category);
  return (
    <div className="grid lg:grid-cols-[1fr_460px]">
      <section className="relative overflow-hidden border-line px-4 py-14 sm:px-8 lg:border-r-2 lg:px-12 lg:py-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#050505_0%,#0d1f00_60%,#2a5c00_130%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_12px,transparent_12px_24px)]"
        />
        <div className="relative">
          <div className="animate-pop-in flex h-20 w-20 items-center justify-center bg-neon-yellow text-4xl">
            🏁
          </div>
          <h1 className="animate-rise-in mt-7 font-display text-6xl leading-[0.85] font-black tracking-[-0.04em] uppercase sm:text-7xl lg:text-8xl">
            {t("register.confirmation.titleLine1")}
            <br />
            <span className="text-neon-lime">
              {t("register.confirmation.titleLine2")}
            </span>
          </h1>
          <p className="mt-6 font-display text-2xl font-extrabold uppercase">
            {event.name}
          </p>
          <p className="mt-1.5 font-mono text-[13px] tracking-[0.14em] text-fg-muted uppercase">
            {fmt.longDate(event.date)} · {fmt.clock(event.startTime)}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button href="/dashboard" size="lg">
              {t("register.confirmation.viewRegistration")}
            </Button>
            <Button href="/dashboard" variant="outline" size="lg">
              {t("register.confirmation.addToCalendar")}
            </Button>
            <Button href={`/events/${event.slug}`} variant="ghost" size="lg">
              {t("register.confirmation.share")}
            </Button>
          </div>
        </div>
      </section>

      <aside className="px-4 py-10 sm:px-8 lg:px-10">
        <div className="border-2 border-line bg-carbon">
          <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
            <span className="font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase">
              {t("register.confirmation.racePass")}
            </span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-fg-faint">
              NR-2026-{category.replace(/\s/g, "").toUpperCase()}
            </span>
          </div>

          <div className="border-b-2 border-line px-5 py-8 text-center">
            <Eyebrow className="tracking-[0.2em]">
              {t("register.confirmation.bibNumber")}
            </Eyebrow>
            <p className="mt-2 font-display text-7xl leading-none font-black tracking-[-0.04em] sm:text-8xl">
              1048
            </p>
            <p className="mt-3 font-mono text-[12px] tracking-[0.16em] text-neon-yellow uppercase">
              {t("register.confirmation.bibMeta", {
                category: categoryName,
              })}
            </p>
            {/* Barcode motif, echoing a real race bib. */}
            <div aria-hidden="true" className="mt-6 flex justify-center gap-[3px]">
              {[4, 2, 6, 2, 4, 8, 2, 4, 6, 2, 5, 3].map((w, i) => (
                <span
                  key={i}
                  style={{ width: `${w}px` }}
                  className="block h-11 bg-fg"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5 px-5 py-6">
            <div
              aria-hidden="true"
              className="h-24 w-24 shrink-0 bg-white p-2"
            >
              <div className="bg-finish-line h-full w-full" />
            </div>
            <div>
              <p className="text-[15px] font-extrabold tracking-wide uppercase">
                {t("register.confirmation.qrTitle")}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
                {t("register.confirmation.qrBody")}
              </p>
              <Button variant="success" size="sm" className="mt-3.5">
                {t("register.confirmation.downloadPass")}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 border-2 border-line px-5 py-5">
          <Eyebrow>{t("register.confirmation.receiptSentTo")}</Eyebrow>
          <p className="mt-2 text-[15px]">alex.rivera@email.com</p>
          <p className="mt-3 flex items-center justify-between text-[13px] text-fg-dim">
            <span>{t("register.confirmation.totalCharged")}</span>
            <span className="font-bold text-fg">{fmt.money(total)}</span>
          </p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Badge tone="green">
            {t("register.confirmation.registrationConfirmed")}
          </Badge>
          <Badge tone="green">
            {t("register.confirmation.paymentReceived")}
          </Badge>
        </div>
      </aside>
    </div>
  );
}

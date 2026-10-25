"use client";

import { Link } from "@/components/i18n/link";
import { useMemo, useRef, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocale, useT } from "@/components/i18n/provider";
import {
  PaymentFields,
  paymentsConfigured,
  type PaymentHandle,
} from "@/components/register/payment-fields";
import {
  AthMovilInstructions,
  AthMovilUnderReview,
} from "@/components/register/ath-movil-payment";
import { paymentCode } from "@/lib/ath-movil/config";
import { formatFinishTime, formatPace } from "@/lib/results/evidence";
import type { Translate } from "@/lib/i18n/translate";
import type { Formatters } from "@/lib/i18n/format";
import {
  distanceLabel,
  startTimeLabel,
  waveLabel,
} from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import {
  DONATIONS,
  FIXTURE_EXTRAS,
  MAX_DONATION,
  SERVICE_FEE,
  parseDonation,
  registrationTotal,
} from "@/lib/events/pricing";
import {
  completeRegistrationPaymentAction,
  startRegistrationPaymentAction,
  submitAthMovilPaymentAction,
  type AthMovilSubmission,
  type ConfirmedSignUp,
} from "@/lib/events/registrations";
import type { RaceCategory, RunningEvent } from "@/lib/types";

/**
 * Five-step registration: race → runner → extras → payment → confirmation.
 *
 * The whole flow is one client component holding its own state. For a race
 * published from /publish (`event.bookable`), leaving step 3 reserves the
 * spot and opens a Stripe payment for the amount the database computed;
 * step 4 collects it with Stripe's Payment Element, and the confirmation shows
 * the bib the database assigned once Stripe says it was paid. The runner
 * fields open pre-filled from their profile.
 *
 * Step 4 also offers ATH Móvil when the race has an account: the runner sends
 * the amount to it from the ATH Móvil app, types in the receipt's reference, and the
 * flow ends on a "payment under review" screen instead of the bib until an
 * admin approves it.
 *
 * A runner whose result the organizer has accepted has finished the race:
 * instead of the bib, they land on a finisher screen with their time.
 *
 * For the fixture races nothing is persisted or charged: step 4 says so and
 * stands in for the round-trip with a timer, and the fields open with the
 * demo account.
 */
const STEPS = [
  { n: 1, key: "register.steps.race" },
  { n: 2, key: "register.steps.runner" },
  { n: 3, key: "register.steps.extras" },
  { n: 4, key: "register.steps.payment" },
  { n: 5, key: "register.steps.done" },
] as const;

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

/** The demo account the fixture races open with. */
const DEMO_RUNNER: Runner = {
  firstName: "Alex",
  lastName: "Rivera",
  email: "alex.rivera@email.com",
  phone: "+1 787 555 0148",
  dob: "1994-03-18",
  gender: "male",
  emergencyName: "Marisol Rivera",
  emergencyPhone: "+1 787 555 0902",
  club: "Neons Nocturnos",
};

/** A registration already on file: what the confirmation screen shows. */
export type ConfirmedRegistration = {
  categoryId: string;
  bib: number;
  amount: number;
  email: string;
  name: string;
};

export type Runner = {
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

type PaymentMethod = "stripe" | "ath_movil";

/** The runner's unpaid sign-up as ATH Móvil left it; see `getAthMovilStatus`. */
export type AthMovilStatus =
  | { state: "submitted"; categoryId: string; submission: AthMovilSubmission }
  | { state: "rejected" }
  | null;

const EMPTY_ERRORS: Errors = {};

/**
 * The pattern `registrations` checks. Caught here so a short number is flagged
 * on this step rather than refused by the server after the payment step.
 */
const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;

/** Messages come from the dictionary so validation speaks the reader's language. */
function validateRunner(r: Runner, t: Translate): Errors {
  const e: Errors = {};
  if (!r.firstName.trim()) e.firstName = t("register.errors.firstName");
  if (!r.lastName.trim()) e.lastName = t("register.errors.lastName");
  if (!r.email.trim()) e.email = t("register.errors.email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
    e.email = t("register.errors.emailInvalid");
  if (!r.phone.trim()) e.phone = t("register.errors.phone");
  else if (!PHONE.test(r.phone.trim()))
    e.phone = t("register.errors.phoneInvalid");
  if (!r.dob) e.dob = t("register.errors.dob");
  if (!r.emergencyName.trim())
    e.emergencyName = t("register.errors.emergencyName");
  if (!r.emergencyPhone.trim())
    e.emergencyPhone = t("register.errors.emergencyPhone");
  else if (!PHONE.test(r.emergencyPhone.trim()))
    e.emergencyPhone = t("register.errors.phoneInvalid");
  return e;
}

export function RegistrationFlow({
  event,
  initialRunner = DEMO_RUNNER,
  initialShirtSize = null,
  initialMailingAddress = "",
  existing = null,
  finishSeconds = null,
  athMovil = null,
}: {
  event: RunningEvent;
  initialRunner?: Runner;
  /** The size saved on the runner's profile, preselected if this race offers it. */
  initialShirtSize?: string | null;
  /** The address saved in the runner's settings, filled in if they pick mail. */
  initialMailingAddress?: string;
  /** Set when the runner has already signed up: opens on the confirmation. */
  existing?: ConfirmedRegistration | null;
  /** The runner's accepted finish time: opens on the finisher screen instead. */
  finishSeconds?: number | null;
  /** Set when an ATH Móvil payment is waiting for review, or was rejected. */
  athMovil?: AthMovilStatus;
}) {
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();

  // A bookable race offers the extras and sizes its organizer picked,
  // possibly none.
  const shirtSizes = event.bookable ? (event.shirtSizes ?? []) : SHIRT_SIZES;
  const extras = event.bookable
    ? (event.extras ?? FIXTURE_EXTRAS)
    : FIXTURE_EXTRAS;
  const shirtPrice = shirtSizes.length > 0 ? extras.shirtPrice : null;
  const photoPrice = extras.photoPrice;
  const shippingPrice = extras.shippingPrice;
  // Not an extra — it costs nothing — but it needs the address, so it sits
  // with them.
  const mailsMedals = Boolean(event.bookable && event.mailsMedals);
  const hasExtras =
    shirtPrice !== null ||
    photoPrice !== null ||
    extras.donationRecipient !== null ||
    shippingPrice !== null ||
    mailsMedals;

  const [confirmed, setConfirmed] = useState(existing);
  const [step, setStep] = useState(existing ? 5 : 1);
  const [review, setReview] = useState(
    athMovil?.state === "submitted" ? athMovil.submission : null,
  );
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ??
      (athMovil?.state === "submitted" ? athMovil.categoryId : undefined) ??
      event.categories.find((c) => c.name === event.featuredDistance)?.id ??
      event.categories[0].id,
  );
  const [waiver, setWaiver] = useState(false);
  const [waiverError, setWaiverError] = useState(false);
  const [runner, setRunner] = useState<Runner>(initialRunner);
  const [errors, setErrors] = useState<Errors>(EMPTY_ERRORS);

  /** An edited field drops its error; the rest stay until the next Continue. */
  function updateRunner(field: keyof Runner, value: string) {
    setRunner((r) => ({ ...r, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const rest = { ...e };
      delete rest[field];
      return rest;
    });
  }
  const [wantsShirt, setWantsShirt] = useState(false);
  const [shirtSize, setShirtSize] = useState<string>(
    initialShirtSize && shirtSizes.includes(initialShirtSize)
      ? initialShirtSize
      : shirtSizes.includes("M")
        ? "M"
        : (shirtSizes[0] ?? "M"),
  );
  const [wantsPhotos, setWantsPhotos] = useState(false);
  const [wantsMail, setWantsMail] = useState(false);
  const [mailingAddress, setMailingAddress] = useState(initialMailingAddress);
  const [addressError, setAddressError] = useState(false);
  // Mailed or picked up, free either way. A race run anywhere has no finish
  // to pick it up at, so the mail comes first there.
  const [medalChoice, setMedalByMail] = useState(Boolean(event.anywhere));
  const medalByMail = mailsMedals && medalChoice;
  // One address serves the kit and the medal alike.
  const needsAddress = wantsMail || medalByMail;
  const [presetDonation, setPresetDonation] = useState<number>(0);
  // What the runner typed in "Other amount"; while it holds anything it wins
  // over the preset buttons.
  const [customDonation, setCustomDonation] = useState("");
  const [donationError, setDonationError] = useState(false);
  const typedDonation = parseDonation(customDonation);
  const donation = customDonation.trim()
    ? (typedDonation ?? 0)
    : presetDonation;
  const [submitting, setSubmitting] = useState(false);
  /**
   * The held sign-up, once step 3 is behind us: the amount the database
   * priced it at, and the Stripe payment opened for it (null without Stripe).
   */
  const [payment, setPayment] = useState<{
    registrationId: string;
    clientSecret: string | null;
    amount: number;
  } | null>(null);
  const paymentRef = useRef<PaymentHandle>(null);
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod>("stripe");
  const [reference, setReference] = useState("");
  const [referenceError, setReferenceError] = useState(false);

  const stripeAvailable = Boolean(payment?.clientSecret) && paymentsConfigured();
  // The account the organizer picked for this race, if it takes ATH Móvil.
  const athAccount = event.bookable ? event.athMovil : undefined;
  const athAvailable = Boolean(athAccount);
  // Whatever was picked, fall back to the method actually on offer.
  const method: PaymentMethod = athAvailable
    && (chosenMethod === "ath_movil" || !stripeAvailable)
    ? "ath_movil"
    : "stripe";
  const payingByAth = event.bookable && method === "ath_movil";

  const category =
    event.categories.find((c) => c.id === categoryId) ?? event.categories[0];
  // At the event's cap every category is out of reach, whatever room each
  // has of its own.
  const soldOut = event.registrationStatus === "full";
  const categoryFull = (c: (typeof event.categories)[number]) =>
    soldOut || c.registered >= c.capacity;

  const { tax, total } = useMemo(
    () =>
      registrationTotal({
        price: category.price,
        extras,
        shirt: wantsShirt,
        photos: wantsPhotos,
        donation,
        mail: wantsMail,
      }),
    [category.price, extras, wantsShirt, wantsPhotos, donation, wantsMail],
  );

  const done = step === 5;

  /** "+$22", or "Free" for an extra the organizer includes at no cost. */
  const extraPrice = (price: number) =>
    price === 0
      ? t("register.step3.free")
      : `+${Number.isInteger(price) ? fmt.moneyWhole(price) : fmt.money(price)}`;

  /** Where a mailed kit, or a mailed medal, goes. */
  const addressField = (
    <Field
      label={t("register.step3.mailingAddress")}
      hint={t("register.step3.mailingAddressHint")}
      error={addressError ? t("register.step3.mailingAddressRequired") : undefined}
      className="mt-5"
    >
      {(p) => (
        <Textarea
          {...p}
          rows={3}
          maxLength={300}
          autoComplete="shipping street-address"
          value={mailingAddress}
          onChange={(e) => {
            setMailingAddress(e.target.value);
            if (e.target.value.trim()) setAddressError(false);
          }}
        />
      )}
    </Field>
  );

  /** A key under `register.errors`, or Stripe's own words about the card. */
  function fail(key: string | null, message?: string) {
    toast({
      title: t(
        key === null || key.startsWith("payment")
          ? "register.errors.paymentTitle"
          : "register.errors.saveTitle",
      ),
      body: key === null ? (message ?? "") : t(`register.errors.${key}`),
      tone: "danger",
    });
  }

  function finish(signUp: ConfirmedSignUp) {
    setConfirmed({ categoryId: category.id, ...signUp });
    setStep(5);
    toast({
      title: t("register.confirmToastTitle"),
      body: t("register.confirmToastBody", { event: event.name }),
    });
  }

  function goNext() {
    if (step === 1) {
      // The pre-selected distance may be one with no spots left.
      if (categoryFull(category)) {
        toast({
          title: t("register.errors.saveTitle"),
          body: t(soldOut ? "register.step1.soldOut" : "register.errors.soldOut"),
          tone: "danger",
        });
        return;
      }
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
    if (step === 3 && typedDonation === null) {
      setDonationError(true);
      return;
    }
    if (step === 3 && needsAddress && !mailingAddress.trim()) {
      setAddressError(true);
      return;
    }
    if (step === 3 && event.bookable) {
      // Reserve the spot and open the payment for what the database prices
      // it at. Called again after going back: the same sign-up is updated.
      setSubmitting(true);
      startRegistrationPaymentAction({
        ...runner,
        categoryId: category.id,
        shirtSize: wantsShirt ? shirtSize : null,
        wantsPhotos,
        donation,
        shipsByMail: wantsMail,
        medalByMail,
        mailingAddress: needsAddress ? mailingAddress : "",
        locale,
      })
        .then((result) => {
          if (!result.ok) return fail(result.error);
          if ("confirmed" in result) return finish(result.confirmed);
          setPayment({
            registrationId: result.registrationId,
            clientSecret: result.clientSecret,
            amount: result.amount,
          });
          setStep(4);
        })
        .catch(() => fail("registrationFailed"))
        .finally(() => setSubmitting(false));
      return;
    }
    if (step === 4 && payingByAth) {
      if (!payment) return;
      if (!reference.trim()) {
        setReferenceError(true);
        // Bring the field to the middle of the screen, clear of the sticky
        // header, and focus it so the message is read out where it applies.
        requestAnimationFrame(() => {
          const field = document.querySelector<HTMLElement>(
            '[name="ath-movil-reference"]',
          );
          field?.scrollIntoView({ behavior: "smooth", block: "center" });
          field?.focus({ preventScroll: true });
        });
        return;
      }
      setSubmitting(true);
      submitAthMovilPaymentAction(payment.registrationId, reference)
        .then((result) => {
          if (!result.ok) return fail(result.error);
          if ("confirmed" in result) return finish(result.confirmed);
          setReview(result.submitted);
          window.scrollTo({ top: 0 });
        })
        .catch(() => fail("registrationFailed"))
        .finally(() => setSubmitting(false));
      return;
    }
    if (step === 4 && event.bookable) {
      const handle = paymentRef.current;
      if (!payment || !handle) return;
      setSubmitting(true);
      handle
        .pay()
        .then(async (outcome) => {
          if (outcome.status === "failed") {
            if (outcome.message) fail(null, outcome.message);
            return;
          }
          const result = await completeRegistrationPaymentAction(
            payment.registrationId,
          );
          if (!result.ok) return fail(result.error);
          finish(result.confirmed);
        })
        .catch(() => fail("registrationFailed"))
        .finally(() => setSubmitting(false));
      return;
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

  if (review && !done) {
    return <AthMovilUnderReview event={event} submission={review} />;
  }

  if (done && confirmed && finishSeconds !== null) {
    return (
      <Finished
        event={event}
        category={category}
        bib={confirmed.bib}
        name={confirmed.name}
        finishSeconds={finishSeconds}
        t={t}
        fmt={fmt}
      />
    );
  }

  if (done) {
    return (
      <Confirmation
        event={event}
        category={category.name}
        total={confirmed?.amount ?? total}
        bib={confirmed?.bib ?? 1048}
        email={confirmed?.email ?? runner.email}
        name={
          confirmed?.name ??
          `${runner.firstName.trim()} ${runner.lastName.trim()}`.trim()
        }
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
              <span className="text-[15px] font-extrabold tracking-widest uppercase">
                {t(s.key)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[1fr_400px]">
        <main className="border-line px-4 py-8 sm:px-8 lg:min-h-168 lg:border-r-2 lg:px-10 lg:py-12">
          {step === 1 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step1.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t("register.step1.body")}
              </p>
              {soldOut ? (
                <p
                  role="status"
                  className="mt-5 border-2 border-line px-4 py-3 text-[14px] font-semibold text-fg-muted"
                >
                  {t("register.step1.soldOut")}
                </p>
              ) : null}

              <div
                role="radiogroup"
                aria-label={t("register.step1.categoryGroup")}
                className="mt-8 flex flex-col gap-0.5 border-2 border-line bg-line"
              >
                {event.categories.map((c) => {
                  const on = c.id === categoryId;
                  const full = categoryFull(c);
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
                              time: startTimeLabel(
                                t,
                                fmt,
                                c.startTime,
                                Boolean(event.endDate),
                              ),
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
                        href="/legal/waiver"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neon-lime underline underline-offset-2"
                      >
                        {t("register.step1.waiverLink")}
                      </Link>{" "}
                      {t("register.step1.waiverPost")}
                    </>
                  }
                />
                {waiverError ? (
                  <p
                    role="alert"
                    className="mt-3 text-[13px] font-semibold text-danger"
                  >
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
                        updateRunner("firstName", e.target.value)
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
                      onChange={(e) => updateRunner("lastName", e.target.value)}
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
                      onChange={(e) => updateRunner("email", e.target.value)}
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
                      onChange={(e) => updateRunner("phone", e.target.value)}
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
                      onChange={(e) => updateRunner("dob", e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("register.step2.gender")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={runner.gender}
                      onChange={(e) => updateRunner("gender", e.target.value)}
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
                        updateRunner("emergencyName", e.target.value)
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
                        updateRunner("emergencyPhone", e.target.value)
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
                      onChange={(e) => updateRunner("club", e.target.value)}
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
                {/* An organizer may switch any extra off, or all of them. */}
                {!hasExtras ? (
                  <p className="p-5 text-[15px] text-fg-dim sm:p-7">
                    {t("register.step3.none")}
                  </p>
                ) : null}
                {shirtPrice !== null ? (
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
                          {extraPrice(shirtPrice)}
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
                        {shirtSizes.map((s) => (
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
                ) : null}

                {photoPrice !== null ? (
                  <div className="flex items-center justify-between gap-5 border-t-2 border-line p-5 first:border-t-0 sm:p-7">
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
                        {extraPrice(photoPrice)}
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
                ) : null}

                {extras.donationRecipient !== null ? (
                  <div className="border-t-2 border-line p-5 first:border-t-0 sm:p-7">
                    <h2 className="font-display text-xl font-black uppercase">
                      {t("register.step3.donate", {
                        recipient: extras.donationRecipient,
                      })}
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
                          aria-checked={
                            !customDonation.trim() && donation === d
                          }
                          onClick={() => {
                            setPresetDonation(d);
                            setCustomDonation("");
                            setDonationError(false);
                          }}
                          className={cn(
                            "min-w-16 border-2 px-4 py-3 text-sm font-bold",
                            !customDonation.trim() && donation === d
                              ? "border-neon-lime bg-neon-lime text-ink"
                              : "border-line-strong text-fg-muted hover:border-fg-dim",
                          )}
                        >
                          {fmt.moneyWhole(d)}
                        </button>
                      ))}
                    </div>
                    <Field
                      label={t("register.step3.customDonation")}
                      error={
                        donationError
                          ? t("register.step3.customDonationInvalid", {
                              max: fmt.moneyWhole(MAX_DONATION),
                            })
                          : undefined
                      }
                      className="mt-5 max-w-56"
                    >
                      {(p) => (
                        <div className="relative">
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-dim"
                          >
                            $
                          </span>
                          <Input
                            {...p}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            value={customDonation}
                            onChange={(e) => {
                              setCustomDonation(e.target.value);
                              if (donationError)
                                setDonationError(
                                  parseDonation(e.target.value) === null,
                                );
                            }}
                            onBlur={() =>
                              setDonationError(typedDonation === null)
                            }
                            className="pl-8"
                          />
                        </div>
                      )}
                    </Field>
                  </div>
                ) : null}

                {shippingPrice !== null ? (
                  <div className="border-t-2 border-line p-5 first:border-t-0 sm:p-7">
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <h2 className="font-display text-xl font-black uppercase">
                          {t("register.step3.mail")}
                        </h2>
                        <p className="mt-1.5 text-sm text-fg-dim">
                          {t("register.step3.mailDetail")}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-display text-xl font-black text-neon-yellow">
                          {extraPrice(shippingPrice)}
                        </span>
                        <Checkbox
                          checked={wantsMail}
                          onChange={(e) => {
                            setWantsMail(e.target.checked);
                            setAddressError(false);
                          }}
                          label={
                            <span className="sr-only">
                              {t("register.step3.addMail")}
                            </span>
                          }
                        />
                      </div>
                    </div>
                    {/* With the medal mailed too, the field sits with it. */}
                    {wantsMail && !medalByMail ? addressField : null}
                  </div>
                ) : null}

                {mailsMedals ? (
                  <div className="border-t-2 border-line p-5 first:border-t-0 sm:p-7">
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <h2 className="font-display text-xl font-black uppercase">
                          {t("register.step3.medalMail")}
                        </h2>
                        <p className="mt-1.5 text-sm text-fg-dim">
                          {t(
                            !medalByMail
                              ? "register.step3.medalPickupDetail"
                              : wantsMail
                                ? "register.step3.medalMailDetailWithKit"
                                : "register.step3.medalMailDetail",
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-xl font-black text-neon-yellow">
                        {t("register.step3.included")}
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t("register.step3.medalDelivery")}
                      className="mt-5 flex flex-wrap gap-2"
                    >
                      {[true, false].map((mail) => (
                        <button
                          key={String(mail)}
                          type="button"
                          role="radio"
                          aria-checked={medalByMail === mail}
                          onClick={() => {
                            setMedalByMail(mail);
                            setAddressError(false);
                          }}
                          className={cn(
                            "border-2 px-4 py-3 text-sm font-bold",
                            medalByMail === mail
                              ? "border-neon-lime bg-neon-lime text-ink"
                              : "border-line-strong text-fg-muted hover:border-fg-dim",
                          )}
                        >
                          {t(
                            mail
                              ? "register.step3.medalByMail"
                              : "register.step3.medalPickup",
                          )}
                        </button>
                      ))}
                    </div>
                    {medalByMail ? addressField : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section>
              <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">
                {t("register.step4.title")}
              </h1>
              <p className="mt-3 text-[15px] text-fg-dim">
                {t(
                  payingByAth
                    ? "register.athMovil.body"
                    : "register.step4.body",
                )}
              </p>

              {athMovil?.state === "rejected" ? (
                <p
                  role="status"
                  className="mt-6 border-2 border-danger p-5 text-[15px] leading-relaxed text-fg sm:p-6"
                >
                  {t("register.athMovil.rejected")}
                </p>
              ) : null}

              {payment && stripeAvailable && athAvailable ? (
                <div
                  role="radiogroup"
                  aria-label={t("register.paymentMethod.group")}
                  className="mt-8 grid gap-0.5 border-2 border-line bg-line sm:grid-cols-2"
                >
                  {(
                    [
                      {
                        value: "stripe",
                        label: t("register.paymentMethod.card"),
                        detail: t("register.paymentMethod.cardDetail"),
                      },
                      {
                        value: "ath_movil",
                        label: t("register.paymentMethod.athMovil"),
                        detail: t("register.paymentMethod.athMovilDetail"),
                      },
                    ] as const
                  ).map(({ value, label, detail }) => {
                    const on = method === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setChosenMethod(value)}
                        className={cn(
                          "flex items-start gap-4 px-5 py-5 text-left transition-colors sm:px-6",
                          on
                            ? "bg-neon-lime/10 text-neon-lime"
                            : "bg-ink hover:bg-carbon",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1 h-5 w-5 shrink-0 border-2",
                            on
                              ? "border-neon-lime bg-neon-lime"
                              : "border-line-bright",
                          )}
                        />
                        <span>
                          <span className="block font-display text-xl font-black uppercase">
                            {label}
                          </span>
                          <span className="mt-1 block text-[13px] text-fg-dim">
                            {detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {payingByAth && payment && athAccount ? (
                <div className="mt-8">
                  <AthMovilInstructions
                    account={athAccount}
                    amount={payment.amount}
                    code={paymentCode(payment.registrationId)}
                    reference={reference}
                    onReferenceChange={(value) => {
                      setReference(value);
                      if (value.trim()) setReferenceError(false);
                    }}
                    error={
                      referenceError
                        ? t("register.athMovil.referenceRequired")
                        : undefined
                    }
                  />
                </div>
              ) : event.bookable && payment?.clientSecret && stripeAvailable ? (
                <>
                  <p className="mt-6 font-mono text-[11px] tracking-[0.14em] text-neon-lime uppercase">
                    {t("register.step4.hold")}
                  </p>
                  <div className="mt-8">
                    {/* A new secret means a repriced order: start afresh. */}
                    <PaymentFields
                      key={payment.clientSecret}
                      ref={paymentRef}
                      clientSecret={payment.clientSecret}
                      locale={locale}
                      returnUrl={
                        typeof window === "undefined"
                          ? ""
                          : `${window.location.origin}${window.location.pathname}`
                      }
                    />
                  </div>
                </>
              ) : (
                <p className="mt-8 border-2 border-line p-5 text-[15px] text-fg-dim sm:p-7">
                  {t(
                    event.bookable
                      ? "register.errors.paymentsUnavailable"
                      : "register.step4.demo",
                  )}
                </p>
              )}
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
                    value={fmt.money(shirtPrice ?? 0)}
                  />
                ) : null}
                {wantsPhotos ? (
                  <SummaryRow
                    label={t("register.summary.photos")}
                    value={fmt.money(photoPrice ?? 0)}
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
                {wantsMail ? (
                  <SummaryRow
                    label={t("register.summary.shipping")}
                    value={fmt.money(shippingPrice ?? 0)}
                  />
                ) : null}
                <SummaryRow
                  label={t("register.summary.salesTax")}
                  value={fmt.money(tax)}
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
                    ? payingByAth
                      ? t("register.athMovil.submit")
                      : t("register.summary.complete")
                    : t("register.summary.continue")}
              </Button>
              {step > 1 ? (
                <Button
                  block
                  variant="outline"
                  size="lg"
                  className="mt-3"
                  // Going back mid-request would be undone when it returns.
                  disabled={submitting}
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                >
                  {t("register.summary.back")}
                </Button>
              ) : null}
              <p className="mt-5 text-xs leading-relaxed text-fg-faint">
                {t("register.summary.refundPre")}{" "}
                <Link
                  href="/legal/refunds"
                  className="text-neon-lime underline"
                >
                  {t("register.summary.refundLink")}
                </Link>
                .
              </p>
            </div>

            <div className="border-t-2 border-line bg-carbon px-5 py-6 sm:px-7">
              <Eyebrow>{t("register.summary.raceDay")}</Eyebrow>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                {fmt.eventDates(event.date, event.endDate)}
                <br />
                {startTimeLabel(
                  t,
                  fmt,
                  category.startTime,
                  Boolean(event.endDate),
                )}{" "}
                · {event.venue}
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
              disabled={submitting}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="min-h-14 border-l-2 border-line px-5 text-xs font-bold tracking-wider text-fg-dim uppercase disabled:opacity-40"
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
                ? payingByAth
                  ? t("register.athMovil.submitShort")
                  : t("register.summary.completeShort")
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
  bib,
  email,
  name,
  t,
  fmt,
}: {
  event: RunningEvent;
  category: string;
  total: number;
  bib: number;
  email: string;
  name: string;
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
            {fmt.longDate(event.date)} ·{" "}
            {startTimeLabel(t, fmt, event.startTime, Boolean(event.endDate))}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button href={`/events/${event.slug}`} size="lg">
              {t("register.confirmation.viewEvent")}
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
              NR-{event.date.slice(0, 4)}-{category.replace(/\s/g, "").toUpperCase()}
            </span>
          </div>

          <div className="px-5 py-8 text-center">
            <Eyebrow className="tracking-[0.2em]">
              {t("register.confirmation.bibNumber")}
            </Eyebrow>
            <p className="mt-2 font-display text-7xl leading-none font-black tracking-[-0.04em] sm:text-8xl">
              {bib}
            </p>
            <p className="mt-3 font-mono text-[12px] tracking-[0.16em] text-neon-yellow uppercase">
              {t("register.confirmation.bibMeta", {
                name,
                category: categoryName,
              })}
            </p>
          </div>
        </div>

        <div className="mt-5 border-2 border-line px-5 py-5">
          <Eyebrow>{t("register.confirmation.receiptSentTo")}</Eyebrow>
          <p className="mt-2 text-[15px]">{email}</p>
          <p className="mt-3 flex items-center justify-between text-[13px] text-fg-dim">
            {/* A bookable race only reaches this screen once Stripe has it. */}
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

/* -------------------------------------------------------------------- */
/* Finished                                                             */
/* -------------------------------------------------------------------- */

/** Stand-in for a race whose organizer has not added the medal yet. */
const MEDAL_PLACEHOLDER = "/medals/placeholder.svg";

/**
 * The race is behind them: the confirmation's layout, with the finish time
 * and the medal where the bib and the receipt were.
 */
function Finished({
  event,
  category,
  bib,
  name,
  finishSeconds,
  t,
  fmt,
}: {
  event: RunningEvent;
  category: RaceCategory;
  bib: number;
  name: string;
  finishSeconds: number;
  t: Translate;
  fmt: Formatters;
}) {
  const categoryName = distanceLabel(t, category.name);
  return (
    <div className="grid lg:grid-cols-[1fr_460px]">
      <section className="relative overflow-hidden border-line px-4 py-14 sm:px-8 lg:border-r-2 lg:px-12 lg:py-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#050505_0%,#1f1d00_60%,#5c5200_130%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_12px,transparent_12px_24px)]"
        />
        <div className="relative">
          <div className="animate-pop-in flex h-20 w-20 items-center justify-center bg-neon-lime text-4xl">
            🏅
          </div>
          <h1 className="animate-rise-in mt-7 font-display text-6xl leading-[0.85] font-black tracking-[-0.04em] uppercase sm:text-7xl lg:text-8xl">
            {t("register.finished.titleLine1")}
            <br />
            <span className="text-neon-yellow">
              {t("register.finished.titleLine2")}
            </span>
          </h1>
          <p className="mt-6 font-display text-2xl font-extrabold uppercase">
            {event.name}
          </p>
          <p className="mt-1.5 font-mono text-[13px] tracking-[0.14em] text-fg-muted uppercase">
            {fmt.longDate(event.date)}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button href="/runners/me" size="lg">
              {t("register.finished.raceHistory")}
            </Button>
            <Button href={`/events/${event.slug}`} size="lg" variant="outline">
              {t("register.confirmation.viewEvent")}
            </Button>
          </div>
        </div>
      </section>

      <aside className="px-4 py-10 sm:px-8 lg:px-10">
        <div className="border-2 border-line bg-carbon">
          <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
            <span className="font-mono text-[11px] tracking-[0.18em] text-neon-yellow uppercase">
              {t("register.finished.officialTime")}
            </span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-fg-faint">
              #{bib}
            </span>
          </div>

          <div className="px-5 py-8 text-center">
            <p className="font-display text-7xl leading-none font-black tracking-[-0.04em] tabular-nums sm:text-8xl">
              {formatFinishTime(finishSeconds)}
            </p>
            <p className="mt-3 font-mono text-[12px] tracking-[0.16em] text-neon-lime uppercase">
              {t("register.confirmation.bibMeta", {
                name,
                category: categoryName,
              })}
            </p>
          </div>

          <dl className="grid grid-cols-2 border-t-2 border-line">
            <div className="border-r-2 border-line px-5 py-4">
              <dt>
                <Eyebrow>{t("register.finished.pace")}</Eyebrow>
              </dt>
              <dd className="mt-1.5 font-bold tabular-nums">
                {formatPace(finishSeconds, category.distanceKm)}
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt>
                <Eyebrow>{t("register.finished.distance")}</Eyebrow>
              </dt>
              <dd className="mt-1.5 font-bold tabular-nums">
                {fmt.distance(category.distanceKm)}
              </dd>
            </div>
          </dl>
        </div>

        <figure className="mt-5 flex items-center gap-5 border-2 border-line px-5 py-5">
          {/* A Supabase Storage URL, like the cover; see `EventCover`. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.medalImage ?? MEDAL_PLACEHOLDER}
            alt={
              event.medalImage
                ? t("events.tabs.medalAlt", { name: event.name })
                : t("events.tabs.medalPlaceholderAlt")
            }
            decoding="async"
            className="aspect-square w-24 shrink-0 bg-carbon object-contain p-2"
          />
          <figcaption>
            <Eyebrow>{t("register.finished.medalEarned")}</Eyebrow>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
              {t("register.finished.medalBody")}
            </p>
          </figcaption>
        </figure>

        <div className="mt-5 flex items-center gap-3">
          <Badge tone="green">{t("register.finished.resultAccepted")}</Badge>
        </div>
      </aside>
    </div>
  );
}

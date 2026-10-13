"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getStripe, hasStripeEnv, toCents } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { settlePayment } from "./payments";
import { SHIRT_SIZES, isOneOf } from "./vocabulary";

/**
 * Signing up for a race published from /publish.
 *
 * This validates the shape of what the runner typed so the form can point at
 * a field. Everything that depends on other rows — the race is live and open,
 * there is a spot left, the runner is old enough, which bib comes next, what
 * it costs — is decided by `register_for_event()` inside one locked
 * transaction, and comes back as a key under `register.errors`.
 *
 * Paying is two calls. `startRegistrationPaymentAction` writes the sign-up as
 * pending — holding a spot for 30 minutes — and opens a Stripe PaymentIntent
 * for the amount the database computed; the payment step collects the card
 * with Stripe.js against it. `completeRegistrationPaymentAction` then asks
 * Stripe whether it was paid and, if so, confirms the sign-up and hands back
 * the bib. Card details only ever travel between the browser and Stripe.
 */

export type RegistrationInput = {
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  /** The flow's select values: female, male, other, undisclosed. */
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  club: string;
  shirtSize: string | null;
  wantsPhotos: boolean;
  donation: number;
  /** The language the runner signed up in: their emails are written in it. */
  locale: string;
};

/** A confirmed sign-up: what the confirmation screen shows. */
export type ConfirmedSignUp = { bib: number; amount: number; email: string };

export type PaymentStart =
  /** Ready to pay: mount Stripe's Payment Element with this secret. */
  | { ok: true; registrationId: string; clientSecret: string; amount: number }
  /** An earlier payment for this race already went through. */
  | { ok: true; confirmed: ConfirmedSignUp }
  | { ok: false; error: string };

export type PaymentCompletion =
  | { ok: true; confirmed: ConfirmedSignUp }
  | { ok: false; error: string };

/** PaymentIntent states the runner can still pay from. */
const PAYABLE = new Set<string>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The same pattern the `registrations` table checks. */
const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;

/** What the database knows how to explain; anything else is a generic failure. */
const KNOWN_ERRORS = new Set([
  "sessionExpired",
  "eventUnavailable",
  "registrationClosed",
  "alreadyRegistered",
  "soldOut",
  "ageNotEligible",
  "extrasChanged",
  "shirtSizeUnavailable",
  "donationInvalid",
]);

const GENDER: Record<string, "f" | "m" | "x"> = {
  female: "f",
  male: "m",
  other: "x",
  undisclosed: "x",
};

/**
 * Copy what the runner just confirmed into their profile, so the next sign-up
 * opens already filled in.
 *
 * The registration row is the record; this is only a convenience, so a failed
 * write is ignored rather than turned into a failed sign-up. A shirt size is
 * only remembered when one was ordered — skipping the shirt says nothing about
 * what fits. The club lives on the public profile, so it is filled in only
 * when the runner has never set one, never overwritten from here. The locale
 * they signed up in becomes the language their emails are written in.
 */
async function rememberDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  details: {
    phone: string;
    birth_date: string;
    /** Null for "rather not say", which the profile records as unset. */
    gender: "f" | "m" | "x" | null;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    club: string;
    shirt_size: string | null;
    locale: string;
  },
) {
  await Promise.all([
    supabase
      .from("profile_private")
      .update({
        phone: details.phone,
        birth_date: details.birth_date,
        gender: details.gender,
        emergency_contact_name: details.emergency_contact_name,
        emergency_contact_phone: details.emergency_contact_phone,
        ...(isLocale(details.locale) ? { locale: details.locale } : {}),
        ...(details.shirt_size && isOneOf(SHIRT_SIZES, details.shirt_size)
          ? { shirt_size: details.shirt_size }
          : {}),
      })
      .eq("id", userId),
    details.club
      ? supabase
          .from("profiles")
          .update({ club: details.club })
          .eq("id", userId)
          .is("club", null)
      : null,
  ]);
}

function confirmedSignUp(row: {
  bib: number | null;
  amount: number;
  email: string;
}): ConfirmedSignUp {
  return { bib: row.bib ?? 0, amount: Number(row.amount), email: row.email };
}

/**
 * Reserve the spot and open the payment. Safe to call again: going back to
 * change an extra updates the same pending sign-up, and the open payment is
 * reused when the amount has not changed.
 */
export async function startRegistrationPaymentAction(
  input: RegistrationInput,
): Promise<PaymentStart> {
  if (!hasStripeEnv()) return { ok: false, error: "paymentsUnavailable" };

  const trim = (v: string) => (typeof v === "string" ? v.trim() : "");
  const details = {
    first_name: trim(input.firstName),
    last_name: trim(input.lastName),
    email: trim(input.email),
    phone: trim(input.phone),
    birth_date: trim(input.dob),
    gender: GENDER[input.gender],
    emergency_contact_name: trim(input.emergencyName),
    emergency_contact_phone: trim(input.emergencyPhone),
    club: trim(input.club),
    shirt_size: input.shirtSize,
    wants_photos: Boolean(input.wantsPhotos),
    donation: Number(input.donation),
  };

  if (
    !UUID.test(input.categoryId) ||
    !details.first_name ||
    details.first_name.length > 80 ||
    !details.last_name ||
    details.last_name.length > 80 ||
    !EMAIL.test(details.email) ||
    !PHONE.test(details.phone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(details.birth_date) ||
    !details.gender ||
    !details.emergency_contact_name ||
    details.emergency_contact_name.length > 80 ||
    !PHONE.test(details.emergency_contact_phone) ||
    details.club.length > 80 ||
    (details.shirt_size !== null && !isOneOf(SHIRT_SIZES, details.shirt_size)) ||
    !Number.isFinite(details.donation)
  ) {
    return { ok: false, error: "detailsInvalid" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "sessionExpired" };

  const stripe = getStripe();

  // A payment already opened for this race. If it went through — another
  // tab, or the confirmation never came back — finish that sign-up instead
  // of repricing it.
  const { data: category } = await supabase
    .from("event_categories")
    .select("event_id")
    .eq("id", input.categoryId)
    .maybeSingle();
  const { data: existing } = category
    ? await supabase
        .from("registrations")
        .select("status, payment_intent_id")
        .eq("runner_id", userData.user.id)
        .eq("event_id", category.event_id)
        .maybeSingle()
    : { data: null };

  let intent: Stripe.PaymentIntent | null = null;
  if (existing?.status === "pending" && existing.payment_intent_id) {
    intent = await stripe.paymentIntents
      .retrieve(existing.payment_intent_id)
      .catch(() => null);
    if (intent?.status === "succeeded") {
      const settled = await settlePayment(intent);
      if (!settled.ok) return settled;
      revalidatePath("/", "layout");
      return { ok: true, confirmed: confirmedSignUp(settled.registration) };
    }
    if (intent?.status === "processing") {
      return { ok: false, error: "paymentProcessing" };
    }
  }

  const { data: reg, error } = await supabase.rpc("register_for_event", {
    p_category_id: input.categoryId,
    p_details: details,
  });

  if (error || !reg) {
    const key = error?.code === "P0001" ? error.message : "";
    return { ok: false, error: KNOWN_ERRORS.has(key) ? key : "registrationFailed" };
  }

  await rememberDetails(supabase, userData.user.id, {
    ...details,
    gender: input.gender === "undisclosed" ? null : details.gender,
    locale: input.locale,
  });

  const amount = Number(reg.amount);
  const cents = toCents(amount);

  try {
    if (!intent || intent.amount !== cents || !PAYABLE.has(intent.status)) {
      // Repriced: the old amount must not stay payable.
      if (intent && PAYABLE.has(intent.status)) {
        await stripe.paymentIntents.cancel(intent.id).catch(() => null);
      }
      intent = await stripe.paymentIntents.create({
        amount: cents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        receipt_email: reg.email,
        metadata: {
          registration_id: reg.id,
          event_id: reg.event_id,
          runner_id: reg.runner_id,
        },
      });
      const { error: saveError } = await createAdminClient()
        .from("registrations")
        .update({ payment_intent_id: intent.id })
        .eq("id", reg.id);
      if (saveError) throw new Error(saveError.message);
    }
  } catch (err) {
    console.error("Opening a payment failed:", err);
    return { ok: false, error: "paymentsUnavailable" };
  }

  if (!intent.client_secret) return { ok: false, error: "paymentsUnavailable" };

  // The hold counts as a taken spot.
  revalidatePath("/", "layout");
  return {
    ok: true,
    registrationId: reg.id,
    clientSecret: intent.client_secret,
    amount,
  };
}

/**
 * Called once Stripe.js reports the payment done. Trusts nothing from the
 * browser but the registration id: whether it was paid comes from Stripe.
 */
export async function completeRegistrationPaymentAction(
  registrationId: string,
): Promise<PaymentCompletion> {
  if (!UUID.test(registrationId)) return { ok: false, error: "registrationFailed" };
  if (!hasStripeEnv()) return { ok: false, error: "paymentsUnavailable" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "sessionExpired" };

  // Organizers can read their runners' rows too; only the runner's own counts.
  const { data: reg } = await supabase
    .from("registrations")
    .select("status, bib, amount, email, payment_intent_id")
    .eq("id", registrationId)
    .eq("runner_id", userData.user.id)
    .maybeSingle();
  if (!reg) return { ok: false, error: "registrationFailed" };
  if (reg.status === "confirmed") {
    return { ok: true, confirmed: confirmedSignUp(reg) };
  }
  if (!reg.payment_intent_id) return { ok: false, error: "paymentIncomplete" };

  let intent: Stripe.PaymentIntent;
  try {
    intent = await getStripe().paymentIntents.retrieve(reg.payment_intent_id);
  } catch (err) {
    console.error("Reading a payment failed:", err);
    return { ok: false, error: "registrationFailed" };
  }

  if (intent.status === "processing") {
    return { ok: false, error: "paymentProcessing" };
  }
  if (intent.status !== "succeeded") {
    return { ok: false, error: "paymentIncomplete" };
  }

  const settled = await settlePayment(intent);
  if (!settled.ok) return settled;

  revalidatePath("/", "layout");
  return { ok: true, confirmed: confirmedSignUp(settled.registration) };
}

"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { MAX_REFERENCE_LENGTH, paymentCode } from "@/lib/ath-movil/config";
import { scheduleReviewRequestedEmail } from "@/lib/email/review-requested";
import { getStripe, hasStripeEnv, toCents } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocale } from "@/lib/i18n/config";
import { WAIVER_VERSION } from "@/lib/legal";
import { LIMITS, withinLimits } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { settlePayment } from "./payments";
import { MAX_CHILDREN } from "./pricing";
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
 *
 * The runner can pay with ATH Móvil instead. The spot is reserved the same
 * way; `submitAthMovilPaymentAction` then records the reference from their
 * ATH Móvil receipt and holds the spot until the organizer or a platform
 * admin finds the payment in the event's ATH Móvil Business account and
 * approves it (see `lib/ath-movil/config.ts`).
 *
 * On a race that takes children, the adult can add up to three to the same
 * sign-up, or sign up only them (`racing: false`). They are part of the one
 * order and the one payment. Their details go to the registration only:
 * nothing about a child is ever copied into the adult's profile.
 */

/** A child the adult is signing up, as typed on the form. */
export type ChildInput = {
  firstName: string;
  lastName: string;
  dob: string;
  /** The flow's select values, as for the adult. */
  gender: string;
  /** The distance this child runs. */
  categoryId: string;
};

export type RegistrationInput = {
  /** The adult's distance. Ignored when they are not racing. */
  categoryId: string;
  /** False when the adult signs up only children. */
  racing: boolean;
  /** Up to three; empty on a sign-up without children. */
  children: ChildInput[];
  /** The adult accepted the waiver on the children's behalf. Required with children. */
  guardianWaiverAccepted: boolean;
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
  /** Which of the race's shirt designs; null without a shirt, or where it shows none. */
  shirtDesignId: string | null;
  wantsPhotos: boolean;
  donation: number;
  /** The paid mail extra: the kit, and the medal on a race that mails it. */
  shipsByMail: boolean;
  /** Where the shipment goes; empty otherwise. */
  mailingAddress: string;
  /** The runner ticked the waiver on the first step. Required. */
  waiverAccepted: boolean;
  /** The language the runner signed up in: their emails are written in it. */
  locale: string;
};

/** A confirmed sign-up: what the confirmation screen shows. */
export type ConfirmedSignUp = {
  /** Null when the adult signed up only children. */
  bib: number | null;
  amount: number;
  email: string;
  /** The runner's name as entered on the sign-up. */
  name: string;
  /** The children on the sign-up, with the bibs they were given. */
  children: { name: string; bib: number | null; categoryId: string }[];
};

/** An ATH Móvil payment waiting for an admin: what the runner is shown. */
export type AthMovilSubmission = {
  amount: number;
  email: string;
  reference: string;
  code: string;
  /** The business path the money was sent to. */
  path: string;
};

export type PaymentStart =
  /**
   * The spot is held. `clientSecret` mounts Stripe's Payment Element; null
   * when card payments are not configured, or the organizer switched them
   * off for this race, and only ATH Móvil is offered.
   */
  | {
      ok: true;
      registrationId: string;
      clientSecret: string | null;
      amount: number;
    }
  /** An earlier payment for this race already went through. */
  | { ok: true; confirmed: ConfirmedSignUp }
  | { ok: false; error: string };

export type PaymentCompletion =
  | { ok: true; confirmed: ConfirmedSignUp }
  | { ok: false; error: string };

export type AthMovilResult =
  | { ok: true; submitted: AthMovilSubmission }
  /** A card payment for this sign-up went through first. */
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
  "shirtDesignUnavailable",
  "donationInvalid",
  "mailingAddressInvalid",
  "paymentUnderReview",
  "holdLimitReached",
  "childrenNotAllowed",
  "tooManyChildren",
  "childrenRequired",
  "childAgeNotEligible",
  "guardianUnderage",
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

async function confirmedSignUp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    id: string;
    bib: number | null;
    amount: number;
    email: string;
    first_name: string;
    last_name: string;
  },
): Promise<ConfirmedSignUp> {
  // Read as the adult, who may see the children on their own sign-up. A
  // failed read costs the list on this screen, not the sign-up: the email
  // has it too.
  const { data: children } = await supabase
    .from("registration_children")
    .select("first_name, last_name, bib, category_id")
    .eq("registration_id", row.id)
    .is("cancelled_at", null)
    .order("position");
  return {
    bib: row.bib,
    amount: Number(row.amount),
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    children: (children ?? []).map((c) => ({
      name: `${c.first_name} ${c.last_name}`.trim(),
      bib: c.bib,
      categoryId: c.category_id,
    })),
  };
}

/**
 * Reserve the spot and open the payment. Safe to call again: going back to
 * change an extra updates the same pending sign-up, and the open payment is
 * reused when the amount has not changed.
 */
export async function startRegistrationPaymentAction(
  input: RegistrationInput,
): Promise<PaymentStart> {
  const stripeReady = hasStripeEnv();

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
    // Only with a shirt; `register_for_event()` checks it is one of the race's.
    shirt_design_id: input.shirtSize ? (input.shirtDesignId ?? null) : null,
    wants_photos: Boolean(input.wantsPhotos),
    donation: Number(input.donation),
    ships_by_mail: Boolean(input.shipsByMail),
    // `register_for_event()` keeps it only with the extra.
    mailing_address: trim(input.mailingAddress),
  };

  const racing = input.racing !== false;
  const list = Array.isArray(input.children) ? input.children : [];
  const children = list.map((c) => ({
    first_name: trim(c?.firstName),
    last_name: trim(c?.lastName),
    birth_date: trim(c?.dob),
    gender: GENDER[c?.gender],
    category_id: trim(c?.categoryId),
  }));
  // An adult who is not racing has no distance of their own: a child's says
  // which event this is.
  const categoryId = racing ? input.categoryId : (children[0]?.category_id ?? "");

  if (
    list.length > MAX_CHILDREN ||
    (!racing && children.length === 0) ||
    children.some(
      (c) =>
        !c.first_name ||
        c.first_name.length > 80 ||
        !c.last_name ||
        c.last_name.length > 80 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(c.birth_date) ||
        !c.gender ||
        !UUID.test(c.category_id),
    )
  ) {
    return { ok: false, error: "childrenInvalid" };
  }

  if (
    !UUID.test(categoryId) ||
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
    (details.shirt_design_id !== null && !UUID.test(String(details.shirt_design_id))) ||
    !Number.isFinite(details.donation) ||
    (details.ships_by_mail && !details.mailing_address) ||
    details.mailing_address.length > 300
  ) {
    return { ok: false, error: "detailsInvalid" };
  }

  // The checkbox on the first step is only the browser's word; a sign-up
  // without the waiver is refused here, and its acceptance is written on the
  // registration below.
  if (input.waiverAccepted !== true) return { ok: false, error: "waiverRequired" };
  // The same for the children: only their parent or guardian can accept it
  // for them.
  if (children.length > 0 && input.guardianWaiverAccepted !== true) {
    return { ok: false, error: "guardianWaiverRequired" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "sessionExpired" };

  // Each call can open a Stripe PaymentIntent (going back and changing an
  // extra reprices it); a script toggling the donation must not open thousands.
  const allowed = await withinLimits([
    { action: "checkout:user", who: userData.user.id, limit: LIMITS.checkoutPerUser },
  ]);
  if (!allowed) return { ok: false, error: "rateLimited" };

  // A payment already opened for this race. If it went through — another
  // tab, or the confirmation never came back — finish that sign-up instead
  // of repricing it.
  const { data: category } = await supabase
    .from("event_categories")
    .select(
      "event_id, event:events!inner(accepts_card_payments, account:ath_movil_accounts!events_ath_movil_account_id_fkey(active))",
    )
    .eq("id", categoryId)
    .maybeSingle();
  // Cards need Stripe configured and the organizer not to have switched them
  // off for this race.
  const cardsReady = stripeReady && category?.event.accepts_card_payments !== false;
  // Without cards, the race's own ATH Móvil account is the only way to pay.
  if (!cardsReady && !category?.event.account?.active) {
    return { ok: false, error: "paymentsUnavailable" };
  }
  const { data: existing } = category
    ? await supabase
        .from("registrations")
        .select("status, payment_intent_id")
        .eq("runner_id", userData.user.id)
        .eq("event_id", category.event_id)
        // A cancelled sign-up stays as a record beside the live one.
        .neq("status", "cancelled")
        .maybeSingle()
    : { data: null };

  let intent: Stripe.PaymentIntent | null = null;
  if (stripeReady && existing?.status === "pending" && existing.payment_intent_id) {
    intent = await getStripe().paymentIntents
      .retrieve(existing.payment_intent_id)
      .catch(() => null);
    if (intent?.status === "succeeded") {
      const settled = await settlePayment(intent);
      if (settled.ok) {
        revalidatePath("/", "layout");
        return {
          ok: true,
          confirmed: await confirmedSignUp(supabase, settled.registration),
        };
      }
      // Refunded — now, or when it could not confirm earlier — so it pays
      // for nothing: fall through and open a new one, which the sign-up
      // checks below price and hold a spot for afresh.
      if (settled.error !== "paymentRefunded") return settled;
    }
    if (intent?.status === "processing") {
      return { ok: false, error: "paymentProcessing" };
    }
  }

  const { data: reg, error } = await supabase.rpc("register_for_event", {
    p_category_id: categoryId,
    // The children ride along here and nowhere else: `rememberDetails()`
    // below is given the adult's own details only.
    p_details: { ...details, racing, children },
  });

  if (error || !reg) {
    const key = error?.code === "P0001" ? error.message : "";
    return { ok: false, error: KNOWN_ERRORS.has(key) ? key : "registrationFailed" };
  }

  // The record that this runner accepted the waiver, which text, and when:
  // kept from the first time they accepted it for this sign-up. Runners
  // cannot write to `registrations`, hence the service role. No record, no
  // checkout: a paid sign-up must not exist without one.
  const { error: waiverError } = await createAdminClient()
    .from("registrations")
    .update({
      waiver_accepted_at: new Date().toISOString(),
      waiver_version: WAIVER_VERSION,
    })
    .eq("id", reg.id)
    .eq("runner_id", userData.user.id)
    .is("waiver_accepted_at", null);
  if (waiverError) {
    console.error(`Recording the waiver for ${reg.id} failed:`, waiverError.message);
    return { ok: false, error: "registrationFailed" };
  }

  if (children.length > 0) {
    const { error: guardianError } = await createAdminClient()
      .from("registrations")
      .update({
        guardian_waiver_accepted_at: new Date().toISOString(),
        guardian_waiver_version: WAIVER_VERSION,
      })
      .eq("id", reg.id)
      .eq("runner_id", userData.user.id)
      .is("guardian_waiver_accepted_at", null);
    if (guardianError) {
      console.error(
        `Recording the guardian's waiver for ${reg.id} failed:`,
        guardianError.message,
      );
      return { ok: false, error: "registrationFailed" };
    }
  }

  await rememberDetails(supabase, userData.user.id, {
    ...details,
    gender: input.gender === "undisclosed" ? null : details.gender,
    locale: input.locale,
  });

  const amount = Number(reg.amount);

  // ATH Móvil only: the held spot is all the payment step needs.
  if (!cardsReady) {
    // A card payment opened before the organizer switched cards off must not
    // stay payable beside the ATH Móvil instructions. One already paid was
    // settled above; one paid while this runs is settled by the webhook.
    if (intent && PAYABLE.has(intent.status)) {
      await getStripe().paymentIntents.cancel(intent.id).catch(() => null);
    }
    return { ok: true, registrationId: reg.id, clientSecret: null, amount };
  }

  const stripe = getStripe();
  const cents = toCents(amount);

  try {
    if (!intent || intent.amount !== cents || !PAYABLE.has(intent.status)) {
      // Repriced: the old amount must not stay payable.
      if (intent && PAYABLE.has(intent.status)) {
        await stripe.paymentIntents.cancel(intent.id).catch(() => null);
      }
      intent = await stripe.paymentIntents.create(
        {
          amount: cents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          receipt_email: reg.email,
          metadata: {
            registration_id: reg.id,
            event_id: reg.event_id,
            runner_id: reg.runner_id,
          },
        },
        {
          // A double click or a second tab runs this twice at once; both
          // must get the same PaymentIntent, or one is left payable but
          // unrecorded. The PaymentIntent already on file is part of the
          // key, so replacing a cancelled or repriced one makes a new one.
          idempotencyKey: `pi-${reg.id}-${cents}-${existing?.payment_intent_id ?? "none"}`,
        },
      );
      // Saved only over what was on file when the sign-up was written, on a
      // sign-up still pending. Otherwise the old payment may have confirmed
      // it in the meantime (it was being paid in another tab, and cancelling
      // it lost that race): overwriting it would make this new payment look
      // like the one that confirmed the sign-up, and leave the real one —
      // which refunds and disputes are matched by — attached to nothing.
      // The same call run twice at once gets the same PaymentIntent, so the
      // second save finding it already there is fine too.
      // Nor over a sign-up whose ATH Móvil payment went in for review since
      // (another tab): it must not gain a payable card form beside it.
      const previous = reg.payment_intent_id;
      const { data: saved, error: saveError } = await createAdminClient()
        .from("registrations")
        .update({ payment_intent_id: intent.id })
        .eq("id", reg.id)
        .eq("status", "pending")
        .is("payment_submitted_at", null)
        .or(
          `payment_intent_id.eq.${intent.id},` +
            (previous ? `payment_intent_id.eq.${previous}` : "payment_intent_id.is.null"),
        )
        .select("id");
      if (saveError) throw new Error(saveError.message);
      if (!saved?.length) {
        // Not recorded anywhere, so it must not stay payable.
        await stripe.paymentIntents.cancel(intent.id).catch(() => null);
        const { data: current } = await supabase
          .from("registrations")
          .select("id, status, bib, amount, email, first_name, last_name, payment_submitted_at")
          .eq("id", reg.id)
          .maybeSingle();
        if (current?.status === "confirmed") {
          revalidatePath("/", "layout");
          return { ok: true, confirmed: await confirmedSignUp(supabase, current) };
        }
        if (current?.payment_submitted_at) {
          return { ok: false, error: "paymentUnderReview" };
        }
        // Another tab opened a different payment for it: start again from
        // what is on file now.
        return { ok: false, error: "registrationFailed" };
      }
    }
  } catch (err) {
    console.error("Opening a payment failed:", err);
    return { ok: false, error: "paymentsUnavailable" };
  }

  if (!intent.client_secret) return { ok: false, error: "paymentsUnavailable" };

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
    .select("id, status, bib, amount, email, first_name, last_name, payment_intent_id")
    .eq("id", registrationId)
    .eq("runner_id", userData.user.id)
    .maybeSingle();
  if (!reg) return { ok: false, error: "registrationFailed" };
  if (reg.status === "confirmed") {
    return { ok: true, confirmed: await confirmedSignUp(supabase, reg) };
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
  return { ok: true, confirmed: await confirmedSignUp(supabase, settled.registration) };
}

/**
 * The runner says they sent the ATH Móvil payment. Records the reference from
 * their receipt and holds the spot until an admin reviews it.
 *
 * A card payment opened for the same sign-up is cancelled first, so the
 * runner cannot pay twice. If it already went through, that sign-up is
 * confirmed instead and nothing is submitted.
 */
export async function submitAthMovilPaymentAction(
  registrationId: string,
  reference: string,
): Promise<AthMovilResult> {
  if (!UUID.test(registrationId)) return { ok: false, error: "registrationFailed" };

  const ref = typeof reference === "string" ? reference.trim() : "";
  if (!ref || ref.length > MAX_REFERENCE_LENGTH) {
    return { ok: false, error: "referenceInvalid" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "sessionExpired" };

  // Each submission holds a spot until someone reviews it and emails the
  // reviewers; a script must not send references as fast as it can type.
  // The database also stops taking them on a sign-up after 3 rejections.
  const allowed = await withinLimits([
    { action: "ath-movil:user", who: userData.user.id, limit: LIMITS.athMovilPerUser },
  ]);
  if (!allowed) return { ok: false, error: "rateLimited" };

  const { data: reg } = await supabase
    .from("registrations")
    .select("id, status, bib, amount, email, first_name, last_name, payment_intent_id")
    .eq("id", registrationId)
    .eq("runner_id", userData.user.id)
    .maybeSingle();
  if (!reg) return { ok: false, error: "registrationFailed" };
  if (reg.status === "confirmed") {
    return { ok: true, confirmed: await confirmedSignUp(supabase, reg) };
  }

  if (reg.payment_intent_id && hasStripeEnv()) {
    const stripe = getStripe();
    try {
      let intent = await stripe.paymentIntents.retrieve(reg.payment_intent_id);
      if (PAYABLE.has(intent.status)) {
        intent = await stripe.paymentIntents
          .cancel(intent.id)
          // Lost a race with the card form: read where it ended up.
          .catch(() => stripe.paymentIntents.retrieve(intent.id));
      }
      if (intent.status === "succeeded") {
        const settled = await settlePayment(intent);
        if (!settled.ok) return settled;
        revalidatePath("/", "layout");
        return {
          ok: true,
          confirmed: await confirmedSignUp(supabase, settled.registration),
        };
      }
      if (intent.status !== "canceled") {
        return { ok: false, error: "paymentProcessing" };
      }
    } catch (err) {
      console.error("Closing the card payment failed:", err);
      return { ok: false, error: "registrationFailed" };
    }
  }

  const { data: submitted, error } = await supabase.rpc(
    "submit_ath_movil_payment",
    { p_registration_id: registrationId, p_reference: ref },
  );
  if (error || !submitted) {
    const key = error?.code === "P0001" ? error.message : "";
    // The race stopped taking ATH Móvil while the runner was paying.
    if (key === "athMovilUnavailable") return { ok: false, error: "paymentsUnavailable" };
    const known = new Set([
      "sessionExpired",
      "referenceInvalid",
      "alreadyRegistered",
      "paymentUnderReview",
      "soldOut",
      "referenceUsed",
      "referenceLimitReached",
      "eventUnavailable",
      "registrationClosed",
    ]);
    return { ok: false, error: known.has(key) ? key : "registrationFailed" };
  }

  // Set by `submit_ath_movil_payment()` from the event's account.
  const { data: account } = submitted.ath_movil_account_id
    ? await supabase
        .from("ath_movil_accounts")
        .select("path")
        .eq("id", submitted.ath_movil_account_id)
        .maybeSingle()
    : { data: null };

  await scheduleReviewRequestedEmail(submitted.id, { kind: "payment" });
  revalidatePath("/", "layout");
  return {
    ok: true,
    submitted: {
      amount: Number(submitted.amount),
      email: submitted.email,
      reference: submitted.payment_reference ?? ref,
      code: paymentCode(submitted.id),
      path: account?.path ?? "",
    },
  };
}

"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { useImperativeHandle, useState, type Ref } from "react";
import type { Locale } from "@/lib/i18n/config";

/**
 * Stripe's Payment Element, dressed in the site's colours.
 *
 * Card number, expiry and CVC live in Stripe-hosted iframes: they go from the
 * browser straight to Stripe and never touch our server. Apple Pay and Google
 * Pay appear on their own on the devices and browsers that support them, as
 * do any other methods switched on in the Stripe dashboard.
 *
 * The Complete button lives in the order summary, outside this tree, so the
 * flow drives payment through the `pay()` handle instead of a form submit.
 */

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Loaded once per page, and only on pages that render the payment step.
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export type PayOutcome =
  | { status: "paid" }
  /** Some methods take a while to clear; the webhook confirms them later. */
  | { status: "processing" }
  /** Stripe's own message, already in the runner's language, when it has one. */
  | { status: "failed"; message?: string };

export type PaymentHandle = { pay: () => Promise<PayOutcome> };

/** The site's palette, from `app/globals.css`. */
const APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#9cff00",
    colorBackground: "#050505",
    colorText: "#ffffff",
    colorTextSecondary: "#8a8a8a",
    colorTextPlaceholder: "#6c6c6c",
    colorDanger: "#ff4d3d",
    fontFamily: "Archivo, system-ui, sans-serif",
    fontSizeBase: "16px",
    borderRadius: "0px",
    spacingUnit: "5px",
  },
  rules: {
    ".Input": {
      border: "2px solid #2a2a2a",
      boxShadow: "none",
      padding: "14px 16px",
    },
    ".Input:focus": { border: "2px solid #9cff00", boxShadow: "none" },
    ".Input--invalid": { border: "2px solid #ff4d3d", boxShadow: "none" },
    ".Tab": { border: "2px solid #2a2a2a", boxShadow: "none" },
    ".Tab:hover": { border: "2px solid #8a8a8a" },
    ".Tab--selected, .Tab--selected:hover, .Tab--selected:focus": {
      border: "2px solid #9cff00",
      backgroundColor: "rgba(156, 255, 0, 0.08)",
      boxShadow: "none",
    },
    ".Label": {
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: "11px",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "#8a8a8a",
    },
  },
};

const FONTS = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=IBM+Plex+Mono&display=swap",
  },
];

export function paymentsConfigured(): boolean {
  return stripePromise !== null;
}

export function PaymentFields({
  clientSecret,
  locale,
  returnUrl,
  ref,
}: {
  clientSecret: string;
  locale: Locale;
  /** Where Stripe sends the runner back after a redirect-based method. */
  returnUrl: string;
  ref: Ref<PaymentHandle>;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, locale, appearance: APPEARANCE, fonts: FONTS }}
    >
      <Fields returnUrl={returnUrl} handle={ref} />
    </Elements>
  );
}

function Fields({
  returnUrl,
  handle,
}: {
  returnUrl: string;
  handle: Ref<PaymentHandle>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);

  useImperativeHandle(
    handle,
    () => ({
      async pay() {
        if (!stripe || !elements || !ready) return { status: "failed" };
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl },
          // Cards and wallets finish here; bank redirects come back to the
          // register page, which confirms the sign-up on load.
          redirect: "if_required",
        });
        if (error) {
          // Validation errors are already shown beside the field.
          return {
            status: "failed",
            message: error.type === "validation_error" ? undefined : error.message,
          };
        }
        if (paymentIntent?.status === "succeeded") return { status: "paid" };
        if (paymentIntent?.status === "processing") return { status: "processing" };
        return { status: "failed" };
      },
    }),
    [stripe, elements, ready, returnUrl],
  );

  return (
    <PaymentElement
      onReady={() => setReady(true)}
      options={{ layout: "tabs" }}
    />
  );
}

import "server-only";
import Stripe from "stripe";

/**
 * Stripe, for server actions and route handlers.
 *
 * The secret key never leaves the server: it is read without the
 * `NEXT_PUBLIC_` prefix, and `server-only` fails the build if a client
 * component imports this module. Use test keys (`sk_test_…`) everywhere but
 * production.
 *
 * Created lazily so a build without the key still succeeds; the payment step
 * reports itself unavailable instead.
 */
let client: Stripe | null = null;

/**
 * Whether payments can run: both halves of the Stripe key pair, and the
 * Supabase service role that confirms a paid registration.
 */
export function hasStripeEnv(): boolean {
  if (isLiveKeyOutsideProduction(process.env.STRIPE_SECRET_KEY)) {
    warnAboutLiveKey();
    return false;
  }
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * A live secret key anywhere but a production build: `next dev` on a laptop
 * with the production `.env` copied in. Every test sign-up there would charge
 * a real card, so payments switch themselves off instead.
 */
export function isLiveKeyOutsideProduction(
  key: string | undefined,
  env: string | undefined = process.env.NODE_ENV,
): boolean {
  return Boolean(key && /^(sk|rk)_live_/.test(key) && env !== "production");
}

let warned = false;
function warnAboutLiveKey(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "STRIPE_SECRET_KEY is a live key outside production: card payments are " +
      "off. Use the test pair (sk_test_… / pk_test_…) locally.",
  );
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and " +
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local.",
    );
  }
  if (isLiveKeyOutsideProduction(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY is a live key outside production. Use the test " +
        "pair (sk_test_… / pk_test_…) locally.",
    );
  }
  client ??= new Stripe(key);
  return client;
}

/** Dollars as stored in `registrations.amount` → Stripe's integer cents. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

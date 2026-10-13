import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { settlePayment } from "@/lib/events/payments";
import { getStripe, hasStripeEnv } from "@/lib/stripe/server";

/**
 * Stripe's word on a payment, for when the runner's browser never reports
 * back: the tab closed mid-payment, or the bank took a while to clear it.
 *
 * Point a webhook endpoint in the Stripe dashboard (or `stripe listen
 * --forward-to localhost:3000/api/stripe/webhook` locally) at this route for
 * `payment_intent.succeeded`, and set STRIPE_WEBHOOK_SECRET to its signing
 * secret. The signature check is the only thing standing between this route
 * and anyone on the internet, so nothing is processed without it.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !hasStripeEnv()) {
    return new Response("Payments are not configured.", { status: 503 });
  }

  // The signature covers the exact bytes Stripe sent: read the raw body.
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    // Not ours: another integration on the same Stripe account.
    if (!intent.metadata?.registration_id) return Response.json({ received: true });

    const settled = await settlePayment(intent);
    // A database failure: answer with an error so Stripe retries later.
    // Everything else is settled, refunded or not, and must not be retried.
    if (!settled.ok && settled.error === "registrationFailed") {
      return new Response("Could not confirm the registration.", { status: 500 });
    }
    revalidatePath("/", "layout");
  }

  return Response.json({ received: true });
}

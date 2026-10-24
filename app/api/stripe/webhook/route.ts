import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { recordDispute, recordRefund, settlePayment } from "@/lib/events/payments";
import { getStripe, hasStripeEnv } from "@/lib/stripe/server";

/**
 * Stripe's word on a payment, for when the runner's browser never reports
 * back: the tab closed mid-payment, or the bank took a while to clear it.
 *
 * Point a webhook endpoint in the Stripe dashboard (or `stripe listen
 * --forward-to localhost:3000/api/stripe/webhook` locally) at this route for
 * `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`,
 * `charge.dispute.updated` and `charge.dispute.closed`, and set
 * STRIPE_WEBHOOK_SECRET to its signing secret. The signature check is the
 * only thing standing between this route and anyone on the internet, so
 * nothing is processed without it.
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
    // A database failure, or a refund Stripe did not take: answer with an
    // error so Stripe delivers the event again. Everything else is settled
    // and must not be retried.
    if (!settled.ok && settled.error === "registrationFailed") {
      return new Response("Could not settle the payment.", { status: 500 });
    }
    if (settled.ok && settled.refundFailed) {
      return new Response("Could not refund the duplicate payment.", { status: 500 });
    }
    revalidatePath("/", "layout");
  }

  // Refunds and chargebacks made in the Stripe dashboard, recorded on the
  // registration they belong to. A database failure asks for a retry.
  if (event.type === "charge.refunded") {
    if (!(await recordRefund(event.data.object))) {
      return new Response("Could not record the refund.", { status: 500 });
    }
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed"
  ) {
    if (!(await recordDispute(event.data.object))) {
      return new Response("Could not record the dispute.", { status: 500 });
    }
  }

  return Response.json({ received: true });
}

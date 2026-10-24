import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import { formatFinishTime } from "@/lib/results/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getRecipient } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

/**
 * "Something is waiting for you" — the email an organizer gets when a runner
 * sends them something to review on the event page:
 *
 *   payment  an ATH Móvil payment, whose spot is held until it is reviewed.
 *   result   a finish time with its screenshot.
 *
 * Admins review from their own queue and are not written to. Runs after the
 * response with `after()`, so the runner never waits on Brevo.
 */

export type ReviewRequest =
  | { kind: "payment" }
  | { kind: "result"; finishSeconds: number };

export async function scheduleReviewRequestedEmail(
  registrationId: string,
  request: ReviewRequest,
): Promise<void> {
  if (!hasBrevoEnv()) return;

  const origin = await siteOrigin();
  after(() =>
    sendReviewRequestedEmail(registrationId, request, origin).catch((err) => {
      console.error(
        `Review request email (${request.kind}) for ${registrationId} failed:`,
        err,
      );
    }),
  );
}

async function sendReviewRequestedEmail(
  registrationId: string,
  request: ReviewRequest,
  origin: string,
) {
  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("registrations")
    .select("event_id, first_name, last_name, amount, payment_reference")
    .eq("id", registrationId)
    .single();
  if (!reg) throw new Error("Registration not found.");
  const { data: event } = await admin
    .from("events")
    .select("name, slug, organizer_id")
    .eq("id", reg.event_id)
    .single();
  if (!event) throw new Error("Event not found.");
  const runner = `${reg.first_name} ${reg.last_name}`;

  const { email: to, name, locale } = await getRecipient(event.organizer_id);
  if (!to) throw new Error("The organizer has no email address.");

  const t = await getTranslator(locale);
  const k = (key: string) =>
    `emails.${request.kind === "payment" ? "paymentToReview" : "resultToReview"}.${key}`;

  const rows: [string, string][] = [
    [t(k("race")), event.name],
    [t(k("runner")), runner],
    ...(request.kind === "payment"
      ? ([
          [t(k("amount")), formatMoney(Number(reg.amount), locale)],
          ...(reg.payment_reference
            ? [[t(k("reference")), reg.payment_reference]]
            : []),
        ] as [string, string][])
      : ([[t(k("time")), formatFinishTime(request.finishSeconds)]] as [string, string][])),
  ];

  await sendEmail({
    to: { email: to, name: name || undefined },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name, runner }),
      preheader: t(k("preheader")),
      heading: name ? t(k("heading"), { name }) : t(k("headingNoName")),
      intro: [t(k("intro"), { event: event.name, runner })],
      rows,
      cta: {
        label: t(k("cta")),
        url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
      },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: [request.kind === "payment" ? "payment-to-review" : "result-to-review"],
  });
}

import "server-only";
import { after } from "next/server";
import { localizePath } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/i18n/format";
import { getTranslator } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { hasBrevoEnv, sendEmail } from "./brevo";
import { renderEmail } from "./layout";
import { getLocaleOf } from "./recipient";
import { siteOrigin } from "./registration-confirmed";

/**
 * "We couldn't find your payment" — the email a runner gets when the
 * organizer or an admin rejects their ATH Móvil payment. Their spot is
 * released; the race page shows the same notice for 7 days and lets them
 * pay again.
 *
 * Only `review_ath_movil_payment()` rejects, and only once per submission,
 * so no claim is needed. Runs after the response with `after()`.
 */

type Registration = Tables<"registrations">;

export async function scheduleAthMovilRejectedEmail(
  registration: Registration,
): Promise<void> {
  if (!hasBrevoEnv()) return;

  const origin = await siteOrigin();
  after(() =>
    sendAthMovilRejectedEmail(registration, origin).catch((err) => {
      console.error(`Rejection email for ${registration.id} failed:`, err);
    }),
  );
}

async function sendAthMovilRejectedEmail(reg: Registration, origin: string) {
  const [{ data: event }, locale] = await Promise.all([
    createAdminClient()
      .from("events")
      .select("name, slug")
      .eq("id", reg.event_id)
      .single(),
    getLocaleOf(reg.runner_id),
  ]);
  if (!event) throw new Error("Event not found.");

  const t = await getTranslator(locale);
  const k = (key: string) => `emails.athMovilRejected.${key}`;
  const rows: [string, string][] = [
    [t(k("race")), event.name],
    [t(k("amount")), formatMoney(Number(reg.amount), locale)],
    ...(reg.payment_reference
      ? [[t(k("reference")), reg.payment_reference] as [string, string]]
      : []),
  ];

  await sendEmail({
    to: { email: reg.email, name: `${reg.first_name} ${reg.last_name}` },
    ...renderEmail({
      locale,
      subject: t(k("subject"), { event: event.name }),
      preheader: t(k("preheader")),
      heading: t(k("heading"), { name: reg.first_name }),
      intro: [t(k("intro"), { event: event.name })],
      rows,
      outro: [t(k("charged"))],
      cta: {
        label: t(k("cta")),
        url: `${origin}${localizePath(`/events/${event.slug}/register`, locale)}`,
      },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: ["ath-movil-rejected"],
  });
}

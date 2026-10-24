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
import { siteOrigin } from "@/lib/site-url";

/**
 * What a runner is told when the organizer — or an admin — changes their
 * confirmed sign-up from the event's registration list:
 *
 *   removed   taken off the list; any refund is a manual step, so the email
 *             points them at us rather than promising one.
 *   pending   an ATH Móvil confirmation undone: back under review with the
 *             spot held and the bib given up. Approving it again sends the
 *             confirmation email afresh; rejecting it, the rejection email.
 *
 * Each RPC changes a confirmed row once, so no claim is needed. Runs after
 * the response with `after()`.
 */

type Registration = Tables<"registrations">;
type Change = "removed" | "pending";

export async function scheduleRegistrationChangedEmail(
  registration: Registration,
  change: Change,
): Promise<void> {
  if (!hasBrevoEnv()) return;

  const origin = await siteOrigin();
  after(() =>
    sendRegistrationChangedEmail(registration, change, origin).catch((err) => {
      console.error(`Registration ${change} email for ${registration.id} failed:`, err);
    }),
  );
}

async function sendRegistrationChangedEmail(
  reg: Registration,
  change: Change,
  origin: string,
) {
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
  const k = (key: string) =>
    `emails.${change === "removed" ? "registrationRemoved" : "registrationPending"}.${key}`;
  const paid = Number(reg.amount) > 0;

  const rows: [string, string][] = [
    [t(k("race")), event.name],
    ...(paid
      ? [[t(k("amount")), formatMoney(Number(reg.amount), locale)] as [string, string]]
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
      outro: [t(k(change === "removed" && !paid ? "nextFree" : "next"))],
      cta:
        change === "removed"
          ? { label: t(k("cta")), url: `${origin}${localizePath("/contact", locale)}` }
          : {
              label: t(k("cta")),
              url: `${origin}${localizePath(`/events/${event.slug}`, locale)}`,
            },
      footer: t(k("footer"), { event: event.name }),
    }),
    tags: [`registration-${change}`],
  });
}

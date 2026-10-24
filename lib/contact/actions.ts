"use server";

import { hasBrevoEnv, sendEmail } from "@/lib/email/brevo";
import { renderEmail } from "@/lib/email/layout";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { clientIp, LIMITS, withinLimits } from "@/lib/rate-limit";

/**
 * The contact form: the visitor's message goes to the team's inbox —
 * `CONTACT_EMAIL`, or the Brevo sender when it is unset — with Reply-To set
 * to the visitor, so answering is a plain reply.
 *
 * Unlike the other emails this one is awaited: the form only says "sent"
 * once Brevo has it. Nothing is sent back to the visitor, so the form cannot
 * be used to mail strangers. `website` is a honeypot: people never see it,
 * bots fill it in, and they are told it went through.
 */

export type ContactResult =
  | { ok: true }
  /** A key under `contactForm.errors`. */
  | { ok: false; error: "invalid" | "unavailable" | "sendFailed" | "rateLimited" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = new Set(["registration", "refund", "results", "organizer", "other"]);
const TOPIC_KEYS: Record<string, string> = {
  registration: "contactForm.topicRegistration",
  refund: "contactForm.topicRefund",
  results: "contactForm.topicResults",
  organizer: "contactForm.topicOrganizer",
  other: "contactForm.topicOther",
};
const MAX = { name: 120, email: 254, message: 5000 };

export async function sendContactMessageAction(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  website: string;
  locale: string;
}): Promise<ContactResult> {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(input?.name);
  const email = str(input?.email);
  const topic = str(input?.topic);
  const message = str(input?.message);

  if (str(input?.website)) return { ok: true };
  if (
    !name ||
    name.length > MAX.name ||
    !EMAIL_RE.test(email) ||
    email.length > MAX.email ||
    !TOPICS.has(topic) ||
    message.length < 10 ||
    message.length > MAX.message
  ) {
    return { ok: false, error: "invalid" };
  }

  const inbox = process.env.CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!hasBrevoEnv() || !inbox) return { ok: false, error: "unavailable" };

  // Each message is an email from the Brevo account that also sends payment
  // confirmations and refund notices; a flood must not use up its quota.
  const allowed = await withinLimits([
    { action: "contact:ip", who: await clientIp(), limit: LIMITS.contactPerIp },
    { action: "contact:email", who: email, limit: LIMITS.contactPerEmail },
  ]);
  if (!allowed) return { ok: false, error: "rateLimited" };

  // The team reads every message in one language, whatever the page was in.
  const t = await getTranslator(DEFAULT_LOCALE);
  const k = (key: string) => `emails.contactMessage.${key}`;
  const topicLabel = t(TOPIC_KEYS[topic]);
  const pageLocale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;

  try {
    await sendEmail({
      to: { email: inbox },
      replyTo: { email, name },
      ...renderEmail({
        locale: DEFAULT_LOCALE,
        subject: t(k("subject"), { topic: topicLabel, name }),
        heading: t(k("heading")),
        intro: [t(k("intro"))],
        rows: [
          [t(k("name")), name],
          [t(k("email")), email],
          [t(k("topic")), topicLabel],
          [t(k("language")), pageLocale.toUpperCase()],
        ],
        note: { label: t(k("message")), body: message },
        footer: t(k("footer")),
      }),
      tags: ["contact-message"],
    });
  } catch (err) {
    console.error("Contact message failed:", err);
    return { ok: false, error: "sendFailed" };
  }
  return { ok: true };
}

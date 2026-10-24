import "server-only";

/**
 * Transactional email through Brevo's REST API.
 *
 * The API key is server-only, like Stripe's: no `NEXT_PUBLIC_` prefix, and
 * `server-only` fails the build if a client component imports this module.
 * The sender address must be a sender verified in Brevo (Senders, Domains &
 * Dedicated IPs), or Brevo refuses the message.
 *
 * Email is optional: without the key nothing is sent and nothing fails.
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type Email = {
  to: { email: string; name?: string };
  /** Where a reply goes, when not to the sender. */
  replyTo?: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** Shown in Brevo's logs and statistics, e.g. "registration-confirmed". */
  tags?: string[];
};

export function hasBrevoEnv(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

/** Hand one email to Brevo. Throws when Brevo does not accept it. */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error(
      "Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL " +
        "in .env.local.",
    );
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: process.env.BREVO_SENDER_NAME || "NEONS RUNNING",
      },
      to: [email.to],
      replyTo: email.replyTo,
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      tags: email.tags,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Brevo answered ${response.status}: ${await response.text()}`);
  }
}

/**
 * Hand many emails to Brevo, a few at a time, so one bad address never stops
 * the rest. Resolves with how many Brevo refused; each refusal is logged.
 */
export async function sendEmails(emails: Email[], concurrency = 5): Promise<number> {
  let next = 0;
  let failed = 0;
  async function worker() {
    while (next < emails.length) {
      const email = emails[next++];
      try {
        await sendEmail(email);
      } catch (err) {
        failed++;
        // No address in the log: tags say which email, Brevo's logs say to whom.
        console.error(`Email (${email.tags?.join(",")}) failed:`, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, worker));
  return failed;
}

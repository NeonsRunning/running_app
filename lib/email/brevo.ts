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
  /**
   * For the emails a runner can switch off (lib/email/unsubscribe.ts): the
   * address mail apps put behind their own "Unsubscribe" button, sent as
   * `List-Unsubscribe`. With `oneClick`, the URL takes a POST that switches
   * the email off at once (RFC 8058), and `List-Unsubscribe-Post` says so.
   * Never on the emails about money or a held spot, which always go.
   */
  listUnsubscribe?: { url: string; oneClick: boolean };
};

/**
 * Brevo may or may not have taken the email: the request went out, and no
 * answer came back before the timeout. Brevo often accepts a message and
 * answers late, and its API has no idempotency key to make a second send
 * safe, so a caller must not simply send again — the runner would get it
 * twice. These notices prefer at most once: the caller records the email as
 * unconfirmed, for a person to check in Brevo's logs, and moves on.
 */
export class UnconfirmedSendError extends Error {
  constructor(cause: unknown) {
    super("Unconfirmed: Brevo did not answer in time; the email may have been sent.", {
      cause,
    });
    this.name = "UnconfirmedSendError";
  }
}

/** How long to wait for Brevo's answer. */
const TIMEOUT_MS = 10_000;

export function hasBrevoEnv(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

/**
 * Hand one email to Brevo. Throws when Brevo does not accept it, and an
 * `UnconfirmedSendError` when it is not known whether Brevo did.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error(
      "Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL " +
        "in .env.local.",
    );
  }

  const headers = email.listUnsubscribe
    ? {
        "List-Unsubscribe": `<${email.listUnsubscribe.url}>`,
        ...(email.listUnsubscribe.oneClick
          ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : {}),
      }
    : undefined;

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
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
        // Extra headers on the message itself.
        headers,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // The timeout fired: the request may have reached Brevo. Any other
    // failure to fetch (no connection, DNS) is thrown as it is and retried.
    if (isTimeout(err)) throw new UnconfirmedSendError(err);
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Brevo answered ${response.status}: ${await response.text()}`);
  }
}

function isTimeout(err: unknown): boolean {
  const name = typeof err === "object" && err !== null ? (err as { name?: unknown }).name : null;
  return name === "TimeoutError" || name === "AbortError";
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

import "server-only";
import type { Locale } from "@/lib/i18n/config";

/**
 * The frame every notification email shares: the black NEONS RUNNING band, a
 * heading and intro, then optional detail rows, a highlighted note, a button
 * and a small-print footer. Builds the HTML and the plain-text version from
 * the same content, so the two never drift apart.
 *
 * Every string arrives unescaped; this module escapes it.
 */

export const INK = "#050505";
export const LIME = "#9cff00";
export const MUTED = "#6b6b6b";
export const LINE = "#e6e6e6";

export function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailContent = {
  locale: Locale;
  subject: string;
  /** The inbox preview line. */
  preheader?: string;
  heading: string;
  /** Paragraphs under the heading. */
  intro: string[];
  /** Label and value, in the order they read. */
  rows?: [string, string][];
  /** A quoted block, such as an admin's reason or a reviewer's note. */
  note?: { label: string; body: string };
  /** Paragraphs after the rows and note. */
  outro?: string[];
  cta?: { label: string; url: string };
  footer: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const P = "margin:0 0 12px;color:#333333;font-size:15px;line-height:1.5;";

export function renderEmail(c: EmailContent): RenderedEmail {
  const rows = c.rows ?? [];
  const outro = c.outro ?? [];

  const text = [
    c.heading,
    "",
    ...c.intro.flatMap((p) => [p, ""]),
    ...(rows.length ? [...rows.map(([l, v]) => `${l}: ${v}`), ""] : []),
    ...(c.note ? [`${c.note.label}: ${c.note.body}`, ""] : []),
    ...outro.flatMap((p) => [p, ""]),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    c.footer,
  ].join("\n");

  const paragraphs = (ps: string[]) =>
    ps.map((p) => `<p style="${P}">${escape(p)}</p>`).join("");

  const rowHtml = rows
    .map(
      ([label, value]) => `
            <tr>
              <td style="padding:10px 0;border-top:1px solid ${LINE};color:${MUTED};font-size:13px;width:38%;vertical-align:top;">${escape(label)}</td>
              <td style="padding:10px 0;border-top:1px solid ${LINE};color:${INK};font-size:14px;font-weight:600;vertical-align:top;">${escape(value)}</td>
            </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${c.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;">
  ${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escape(c.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${INK};padding:20px 28px;color:${LIME};font-size:15px;font-weight:800;letter-spacing:2px;">NEONS RUNNING</td></tr>
        <tr><td style="padding:28px 28px 4px;">
          <h1 style="margin:0 0 12px;color:${INK};font-size:26px;line-height:1.2;">${escape(c.heading)}</h1>
          ${paragraphs(c.intro)}
        </td></tr>${
          rows.length
            ? `
        <tr><td style="padding:8px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}
          </table>
        </td></tr>`
            : ""
        }${
          c.note
            ? `
        <tr><td style="padding:12px 28px;">
          <div style="border-top:1px solid ${LINE};padding-top:14px;color:${MUTED};font-size:13px;">${escape(c.note.label)}</div>
          <p style="margin:6px 0 0;color:${INK};font-size:15px;font-weight:600;line-height:1.5;white-space:pre-line;">${escape(c.note.body)}</p>
        </td></tr>`
            : ""
        }${
          outro.length
            ? `
        <tr><td style="padding:12px 28px 0;">${paragraphs(outro)}</td></tr>`
            : ""
        }${
          c.cta
            ? `
        <tr><td style="padding:16px 28px 28px;">
          <a href="${escape(c.cta.url)}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">${escape(c.cta.label)}</a>
        </td></tr>`
            : `
        <tr><td style="padding:8px 28px;"></td></tr>`
        }
        <tr><td style="padding:18px 28px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.5;">${escape(c.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: c.subject, html, text };
}

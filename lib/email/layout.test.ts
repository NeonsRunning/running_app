import { describe, expect, it } from "vitest";
import { escape, renderEmail, type EmailContent } from "./layout";

describe("escape", () => {
  it("escapes everything that could break out of text or an attribute", () => {
    expect(escape(`<a href="x" onclick='y'>Tom & Jerry</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;",
    );
  });

  it("escapes an ampersand first, so nothing is escaped twice", () => {
    expect(escape("&lt;")).toBe("&amp;lt;");
  });
});

const base: EmailContent = {
  locale: "en",
  subject: "Tomorrow: Run <5K>",
  preheader: "Starts at 6",
  heading: "Hi Ana",
  intro: ["First", "Second"],
  footer: "Footer & small print",
};

describe("renderEmail", () => {
  it("builds the text version from the same content, in reading order", () => {
    const { subject, text } = renderEmail({
      ...base,
      rows: [
        ["Race", "Run <5K>"],
        ["Bib", "42"],
      ],
      note: { label: "Note", body: "Bring water" },
      outro: ["See you"],
      cta: { label: "View race", url: "https://example.test/events/run" },
    });
    expect(subject).toBe("Tomorrow: Run <5K>");
    expect(text).toBe(
      [
        "Hi Ana",
        "",
        "First",
        "",
        "Second",
        "",
        "Race: Run <5K>",
        "Bib: 42",
        "",
        "Note: Bring water",
        "",
        "See you",
        "",
        "View race: https://example.test/events/run",
        "",
        "Footer & small print",
      ].join("\n"),
    );
  });

  it("escapes every string in the HTML", () => {
    const { html } = renderEmail({
      ...base,
      rows: [["<b>", `"quoted"`]],
      note: { label: "Why", body: "<script>alert(1)</script>" },
      cta: { label: "Go", url: `https://example.test/?a=1&b="2"` },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<5K>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<title>Tomorrow: Run &lt;5K&gt;</title>");
    expect(html).toContain(`href="https://example.test/?a=1&amp;b=&quot;2&quot;"`);
    expect(html).toContain("Footer &amp; small print");
  });

  it("sets the document language and the preview line", () => {
    const { html } = renderEmail({ ...base, locale: "es" });
    expect(html).toContain(`<html lang="es">`);
    expect(html).toContain("Starts at 6");
    expect(renderEmail({ ...base, preheader: undefined }).html).not.toContain(
      "display:none",
    );
  });

  it("leaves out the sections it was not given", () => {
    const { html, text } = renderEmail(base);
    expect(html).not.toContain("<a ");
    expect(text).toBe("Hi Ana\n\nFirst\n\nSecond\n\nFooter & small print");
  });

  it("adds the email settings link under the footer of an optional email", () => {
    const manage = { label: "Choose emails", url: "https://example.test/runners/me/settings" };
    const { html, text } = renderEmail({ ...base, manage });
    expect(text.endsWith("Footer & small print\n\nChoose emails: https://example.test/runners/me/settings")).toBe(
      true,
    );
    expect(html).toMatch(
      /Footer &amp; small print<br><a href="https:\/\/example\.test\/runners\/me\/settings"[^>]*>Choose emails<\/a>/,
    );
  });
});

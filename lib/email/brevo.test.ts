import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail, UnconfirmedSendError, type Email } from "./brevo";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "key");
  vi.stubEnv("BREVO_SENDER_EMAIL", "hola@neons.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const email: Email = {
  to: { email: "ana@example.test", name: "Ana" },
  subject: "S",
  html: "<p>H</p>",
  text: "T",
  tags: ["race-reminder"],
};

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("sendEmail", () => {
  it("hands the email to Brevo", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    await sendEmail(email);
    const body = sentBody();
    expect(body.to).toEqual([email.to]);
    expect(body.textContent).toBe("T");
    expect(body.headers).toBeUndefined();
  });

  it("adds List-Unsubscribe, and the one-click header when it applies", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    await sendEmail({
      ...email,
      listUnsubscribe: { url: "https://neons.test/api/email/unsubscribe?u=1", oneClick: true },
    });
    expect(sentBody().headers).toEqual({
      "List-Unsubscribe": "<https://neons.test/api/email/unsubscribe?u=1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });

    fetchMock.mockClear();
    await sendEmail({
      ...email,
      listUnsubscribe: { url: "https://neons.test/runners/me/settings", oneClick: false },
    });
    expect(sentBody().headers).toEqual({
      "List-Unsubscribe": "<https://neons.test/runners/me/settings>",
    });
  });

  it("throws what Brevo said when it refuses", async () => {
    fetchMock.mockResolvedValue(new Response("bad address", { status: 400 }));
    await expect(sendEmail(email)).rejects.toThrow("Brevo answered 400: bad address");
  });

  it("calls a timeout unconfirmed, not failed", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(sendEmail(email)).rejects.toBeInstanceOf(UnconfirmedSendError);
  });

  it("passes any other network failure on as it is", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await sendEmail(email).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(UnconfirmedSendError);
  });
});

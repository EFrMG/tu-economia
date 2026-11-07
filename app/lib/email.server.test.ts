import { afterEach, describe, expect, it, vi } from "vitest";

import { accessLinkEmail } from "./email-templates";
import { emailDelivery, sendEmail } from "./email.server";

afterEach(() => vi.unstubAllGlobals());

const verifyURL =
  "https://auth.example.test/api/auth/magic-link/verify?token=abc";

const message = () => ({
  to: "user@example.test",
  ...accessLinkEmail({ url: verifyURL }),
});

describe("email delivery setup", () => {
  it("is ready only with both the API key and a verified sender", () => {
    expect(emailDelivery({})).toBeNull();
    expect(emailDelivery({ RESEND_API_KEY: "re_synthetic" })).toBeNull();
    expect(
      emailDelivery({ EMAIL_FROM: "Tu Economía <acceso@example.test>" }),
    ).toBeNull();

    expect(
      emailDelivery({
        RESEND_API_KEY: "re_synthetic",
        EMAIL_FROM: "Tu Economía <acceso@example.test>",
      }),
    ).toEqual({
      apiKey: "re_synthetic",
      from: "Tu Economía <acceso@example.test>",
    });
  });
});

describe("sendEmail", () => {
  it("posts the message to Resend and resolves once the provider accepts it", async () => {
    const requests: { input: string; init?: RequestInit }[] = [];

    vi.stubGlobal("fetch", (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push({ input: String(input), init });

      return Response.json({ id: "synthetic-message" });
    }) as typeof fetch);

    await expect(
      sendEmail({ apiKey: "re_synthetic", from: "sender" }, message()),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe("https://api.resend.com/emails");

    // The wording must keep matching Better Auth's five-minute, single-use link.
    const payload = JSON.parse(String(requests[0].init?.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    expect(payload).toEqual({
      from: "sender",
      to: ["user@example.test"],
      subject: "Tu enlace de acceso a Tu Economía",
      text: expect.stringContaining(verifyURL),
      html: expect.stringContaining(`href="${verifyURL}"`),
    });

    expect(payload.text).toContain("5 minutos");
    expect(payload.text).toContain("una vez");
  });

  it("throws before anything is recorded when Resend rejects the message", async () => {
    vi.stubGlobal("fetch", (async () =>
      Response.json(
        { message: "validation" },
        { status: 422 },
      )) as typeof fetch);

    await expect(
      sendEmail({ apiKey: "re_synthetic", from: "sender" }, message()),
    ).rejects.toThrow("Resend rejected the message with status 422");
  });
});

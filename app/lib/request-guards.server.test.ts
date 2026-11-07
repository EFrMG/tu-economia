import { expect, it } from "vitest";

import { readLimitedJSON, requireOrigin } from "~/lib/request-guards.server";

const BASE = "https://example.test";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/api/x`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });

const thrownStatus = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error.status;

    throw error;
  }
};

it("accepts only requests whose Origin, URL and fetch site agree", () => {
  expect(() => requireOrigin(post("{}", { Origin: BASE }), BASE)).not.toThrow();

  const rejected: Record<string, string>[] = [
    {},
    { Origin: "https://evil.test" },
    { Origin: BASE, "Sec-Fetch-Site": "cross-site" },
  ];

  for (const headers of rejected)
    try {
      requireOrigin(post("{}", headers), BASE);
      expect.unreachable();
    } catch (error) {
      expect((error as Response).status).toBe(403);
    }

  try {
    requireOrigin(post("{}", { Origin: BASE }), "https://other.test");
    expect.unreachable();
  } catch (error) {
    expect((error as Response).status).toBe(403);
  }
});

it("parses a JSON body within the limit", async () => {
  await expect(readLimitedJSON(post('{"ok":true}'), 64)).resolves.toEqual({
    ok: true,
  });

  await expect(
    readLimitedJSON(
      post('{"ok":true}', {
        "Content-Type": "application/json; charset=utf-8",
      }),
      64,
    ),
  ).resolves.toEqual({ ok: true });
});

it("rejects wrong content types, oversized, missing and malformed bodies", async () => {
  expect(
    await thrownStatus(
      readLimitedJSON(post("{}", { "Content-Type": "text/plain" }), 64),
    ),
  ).toBe(415);

  expect(
    await thrownStatus(
      readLimitedJSON(post("{}", { "Content-Length": "65" }), 64),
    ),
  ).toBe(413);

  // The declared length is not trusted: the streamed byte count decides.
  expect(
    await thrownStatus(
      readLimitedJSON(post(JSON.stringify({ a: "x".repeat(100) })), 64),
    ),
  ).toBe(413);

  expect(await thrownStatus(readLimitedJSON(post(null), 64))).toBe(400);
  expect(await thrownStatus(readLimitedJSON(post("{nope"), 64))).toBe(400);
  expect(
    await thrownStatus(
      readLimitedJSON(post(new Uint8Array([0x7b, 0xff, 0x7d])), 64),
    ),
  ).toBe(400);
});

import { expect, it } from "vitest";

import { withBaselineHeaders } from "~/lib/security-headers.server";

it("adds nosniff to a JSON response and keeps its status, headers and body", async () => {
  const response = withBaselineHeaders(
    Response.json(
      { ok: true },
      { status: 429, headers: { "Retry-After": "60" } },
    ),
  );

  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(response.status).toBe(429);
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it("leaves a response that already sets the header untouched", () => {
  const original = new Response("<p>x</p>", {
    headers: { "X-Content-Type-Options": "nosniff" },
  });

  expect(withBaselineHeaders(original)).toBe(original);
});

it("works on a response with immutable headers", () => {
  const response = Response.redirect("https://example.test/", 302);

  expect(
    withBaselineHeaders(response).headers.get("X-Content-Type-Options"),
  ).toBe("nosniff");
});

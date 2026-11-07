import { expect, it, vi } from "vitest";

import { isRateLimited } from "~/lib/rate-limit.server";

const request = (ip?: string) =>
  new Request("https://example.test/resources/prices", {
    headers: ip ? { "CF-Connecting-IP": ip } : {},
  });

const limiter = (success: boolean) =>
  ({ limit: vi.fn(async () => ({ success })) }) satisfies RateLimit;

it("keys the limiter by the client IP and blocks when it refuses", async () => {
  const refusing = limiter(false);

  await expect(isRateLimited(refusing, request("203.0.113.7"))).resolves.toBe(
    true,
  );

  expect(refusing.limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
  await expect(
    isRateLimited(limiter(true), request("203.0.113.7")),
  ).resolves.toBe(false);
});

it("fails open without a binding, without a client IP, or when the limiter errors", async () => {
  await expect(isRateLimited(undefined, request("203.0.113.7"))).resolves.toBe(
    false,
  );

  const unused = limiter(false);
  await expect(isRateLimited(unused, request())).resolves.toBe(false);
  expect(unused.limit).not.toHaveBeenCalled();

  const broken = {
    limit: vi.fn(async () => {
      throw new Error("limiter unavailable");
    }),
  } satisfies RateLimit;

  await expect(isRateLimited(broken, request("203.0.113.7"))).resolves.toBe(
    false,
  );
});

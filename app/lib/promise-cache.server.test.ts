import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createPromiseCache } from "~/lib/promise-cache.server";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-03T16:00:00.000Z"));
});

afterEach(() => vi.useRealTimers());

const failing = () =>
  vi.fn(async (): Promise<string> => {
    throw new Error("outage");
  });

it("shares concurrent work and serves a value until its ttl expires", async () => {
  const cache = createPromiseCache();
  const load = vi.fn(async () => "ok");

  const [first, second] = await Promise.all([
    cache.get("k", 1_000, load),
    cache.get("k", 1_000, load),
  ]);

  expect([first, second]).toEqual(["ok", "ok"]);
  expect(cache.isFresh("k")).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1_001);

  expect(cache.isFresh("k")).toBe(false);
  await cache.get("k", 1_000, load);
  expect(load).toHaveBeenCalledTimes(2);
});

it("serves the same failure without calling upstream while a key is backing off", async () => {
  const cache = createPromiseCache();
  const load = failing();

  await expect(cache.get("k", 1_000, load)).rejects.toThrow("outage");
  expect(cache.isFresh("k")).toBe(false);

  await expect(cache.get("k", 1_000, load)).rejects.toThrow("outage");
  await expect(cache.get("k", 1_000, load)).rejects.toThrow("outage");
  expect(load).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(5_000);

  await expect(cache.get("k", 1_000, load)).rejects.toThrow("outage");
  expect(load).toHaveBeenCalledTimes(2);
});

it("doubles the backoff on consecutive failures up to thirty seconds and resets on success", async () => {
  const cache = createPromiseCache();
  const load = failing();

  let expectedCalls = 0;

  for (const backoff of [5_000, 10_000, 20_000, 30_000, 30_000]) {
    await expect(cache.get("k", 1_000, load)).rejects.toThrow();
    expectedCalls += 1;

    // One millisecond short of the window the failure is still served from memory.
    vi.advanceTimersByTime(backoff - 1);
    await expect(cache.get("k", 1_000, load)).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(expectedCalls);

    // At the end of the window the next loop iteration reaches upstream again.
    vi.advanceTimersByTime(1);
  }

  const recovering = vi.fn(async () => "ok");
  await expect(cache.get("k", 1_000, recovering)).resolves.toBe("ok");

  vi.advanceTimersByTime(1_001);

  // The success cleared the escalation, so the next failure backs off for only five seconds.
  await expect(cache.get("k", 1_000, load)).rejects.toThrow();
  vi.advanceTimersByTime(5_000);
  await expect(cache.get("k", 1_000, recovering)).resolves.toBe("ok");
});

it("backs off per key", async () => {
  const cache = createPromiseCache();

  await expect(cache.get("a", 1_000, failing())).rejects.toThrow();
  await expect(cache.get("b", 1_000, async () => "ok")).resolves.toBe("ok");
});

it("forgets the escalation after a quiet period", async () => {
  const cache = createPromiseCache();
  const load = failing();

  await expect(cache.get("k", 1_000, load)).rejects.toThrow();
  vi.advanceTimersByTime(5_000);
  await expect(cache.get("k", 1_000, load)).rejects.toThrow();

  // The second failure set a ten-second backoff; after it plus the quiet period the count restarts at one.
  vi.advanceTimersByTime(10_000 + 5 * 60_000 + 1);
  await expect(cache.get("k", 1_000, load)).rejects.toThrow();
  vi.advanceTimersByTime(5_000);

  await expect(cache.get("k", 1_000, async () => "ok")).resolves.toBe("ok");
});

it("shortens only the entry it was given", async () => {
  const cache = createPromiseCache();

  const value = cache.get("k", 60_000, async () => "ok");
  await value;

  cache.shorten("k", Promise.resolve("other"), 1_000);
  vi.advanceTimersByTime(2_000);
  expect(cache.isFresh("k")).toBe(true);

  cache.shorten("k", value, 1_000);
  vi.advanceTimersByTime(2_000);
  expect(cache.isFresh("k")).toBe(false);
});

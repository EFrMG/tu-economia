import { afterEach, expect, it, vi } from "vitest";

import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

afterEach(() => vi.useRealTimers());

it("settles and aborts an upstream request that ignores its signal", async () => {
  vi.useFakeTimers();
  let aborted = false;

  const pending = withUpstreamTimeout(50, (signal) => {
    signal.addEventListener("abort", () => {
      aborted = true;
    });

    return new Promise<string>(() => undefined);
  });

  const outcome = expect(pending).rejects.toThrow(
    "La fuente agotó el tiempo de espera.",
  );

  await vi.advanceTimersByTimeAsync(50);
  await outcome;
  expect(aborted).toBe(true);

  await expect(withUpstreamTimeout(50, async () => "recovered")).resolves.toBe(
    "recovered",
  );

  expect(vi.getTimerCount()).toBe(0);
});

/** First backoff after an upstream failure; each consecutive failure doubles it up to `MAX_BACKOFF_MS`. */
const BASE_BACKOFF_MS = 5_000;

/** Stays under the 30-second first delay of `useFailedDataRetry`, so an automatic retry always reaches upstream. */
const MAX_BACKOFF_MS = 30_000;

/** A failure record that has been quiet this long no longer escalates the next backoff. */
const FAILURE_FORGET_MS = 5 * 60_000;

/** Failure records are keyed by caller-supplied strings; this keeps a flood of distinct failing keys bounded. */
const MAX_FAILURE_RECORDS = 256;

interface Entry {
  expiresAt: number;
  value: Promise<unknown>;
}

interface Failure {
  count: number;
  retryAt: number;
  error: unknown;
}

export interface PromiseCache {
  /**
   * Caches by key for `ttlMs`. The promise itself is cached so that concurrent requests share a single upstream fetch.
   * A rejection is evicted from the cache, but remembered briefly: while the key is backing off, callers receive the same error without another upstream request.
   */
  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;

  /** Whether a usable value is cached for the key. Call before `get` to learn whether `get` will be served from the cache. */
  isFresh(key: string): boolean;

  /** Shortens the lifetime of the cached `value` to at most `ttlMs` from now; a newer entry for the key is left alone. */
  shorten(key: string, value: Promise<unknown>, ttlMs: number): void;
}

export function createPromiseCache(): PromiseCache {
  const entries = new Map<string, Entry>();
  const failures = new Map<string, Failure>();

  function recordFailure(key: string, error: unknown) {
    const now = Date.now();
    const previous = failures.get(key);

    const count =
      previous && previous.retryAt + FAILURE_FORGET_MS > now
        ? previous.count + 1
        : 1;

    // Re-inserting moves the key to the end, so the oldest record is always the first.
    failures.delete(key);
    failures.set(key, {
      count,
      retryAt:
        now + Math.min(BASE_BACKOFF_MS * 2 ** (count - 1), MAX_BACKOFF_MS),
      error,
    });

    for (const [oldKey, failure] of failures) {
      if (
        failures.size <= MAX_FAILURE_RECORDS &&
        failure.retryAt + FAILURE_FORGET_MS > now
      )
        break;

      failures.delete(oldKey);
    }
  }

  return {
    get<T>(key: string, ttlMs: number, load: () => Promise<T>) {
      const now = Date.now();

      const hit = entries.get(key);
      if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

      const failure = failures.get(key);
      if (failure && failure.retryAt > now)
        return Promise.reject(failure.error);

      const value: Promise<T> = load().then(
        (result) => {
          failures.delete(key);

          return result;
        },
        (error: unknown) => {
          if (entries.get(key)?.value === value) entries.delete(key);

          recordFailure(key, error);

          throw error;
        },
      );

      entries.set(key, { expiresAt: now + ttlMs, value });

      return value;
    },

    isFresh(key) {
      const hit = entries.get(key);

      return Boolean(hit && hit.expiresAt > Date.now());
    },

    shorten(key, value, ttlMs) {
      const entry = entries.get(key);

      if (entry?.value === value)
        entry.expiresAt = Math.min(entry.expiresAt, Date.now() + ttlMs);
    },
  };
}

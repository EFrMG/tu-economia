/**
 * Whether this client has exceeded `limiter`'s allowance. Fails open: a missing binding (local development, tests) or a limiter error never blocks a visitor, because the limit protects upstream sources and is not an access control.
 * Clients are keyed by the IP Cloudflare reports, which is absent outside Cloudflare.
 */
export async function isRateLimited(
  limiter: RateLimit | undefined,
  request: Request,
) {
  const key = request.headers.get("CF-Connecting-IP");
  if (!limiter || !key) return false;

  try {
    const { success } = await limiter.limit({ key });

    return !success;
  } catch (error) {
    // Logged so a broken binding does not pass as an unreached limit.
    console.warn(
      "rate limiter failed open:",
      error instanceof Error ? error.message : String(error),
    );

    return false;
  }
}

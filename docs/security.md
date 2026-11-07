# Security

How the Worker protects itself, its visitors' records and the upstream sources it calls. Account and session details are in [cloud-finance-setup.md](cloud-finance-setup.md), payment verification in [billing.md](billing.md).

## Response headers

`app/entry.server.tsx` sets these on every server-rendered page:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; scripts and styles from `'self'` and inline; images from `'self'`, `data:` and any HTTPS origin; fonts from `'self'` and `data:`; `connect-src 'self'`; `base-uri`, `form-action` `'self'`; `frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation and payment disabled |
| `X-Content-Type-Options` | `nosniff` |

`workers/app.ts` passes every response through `withBaselineHeaders` (`app/lib/security-headers.server.ts`), which adds `nosniff` where missing, so JSON routes carry it too. The other headers apply to documents, and HSTS covers the whole host once a browser has seen it on any page. Anything else wanted on `/resources/*` or `/api/*` belongs in `withBaselineHeaders` or at the Cloudflare edge.

- The policy allows `'unsafe-inline'` for scripts and styles; removing it would need per-request nonces in both rendering and markup.
- `connect-src 'self'` holds because every upstream request is made by the server. A client component that calls a third-party origin needs the policy changed first.
- A CSP mistake can fail silently at runtime, so check a change by browsing the app.
- No CORS is configured: the routes are same-origin.

## Account and data endpoints

The handlers (`finance-store.server.ts`, `billing.server.ts`, the account route) share the guards in `app/lib/request-guards.server.ts`. Each guard throws a `Response`, so a handler lets it propagate.

- **Session**: `authenticated` answers `503` while accounts are unconfigured and `401` without a session. JSON mutations also carry an `expectedUserId` that must match the session, so a request prepared for another account is refused.
- **Same origin**: `requireOrigin` answers `403` unless the `Origin` header, the request URL and the app's base URL (`AUTH_BASE_URL`) agree and `Sec-Fetch-Site` is not `cross-site`. Better Auth's own origin check stays enabled.
- **Bodies**: `readLimitedJSON` requires `application/json` (`415`), counts the bytes actually received instead of trusting `Content-Length` (`413`) and rejects invalid UTF-8 or JSON (`400`). The finance form accepts a JSON document or import file of at most 512 KiB, plus 1 MiB of multipart framing.
- **Caching**: account, billing and export responses are `private, no-store`.
- **Sign-in**: Better Auth's rate limiting is enabled, with its counters in D1.
- **Webhook**: the billing webhook checks an HMAC-SHA-256 signature with a five-minute timestamp tolerance and treats the notification as a hint, always fetching the resource from Mercado Pago. See [billing.md](billing.md#endpoints).

## Protecting upstream sources

`/resources/prices` forwards product ids to the unofficial Precios Claros API, which could block the Worker.

- It accepts only a known location and ids from the generated basket or valid barcodes, at most 8 per request, so a request stays under the 50 subrequests a Worker invocation allows.
- `PRICES_LIMITER` allows 30 requests per minute per client IP (`CF-Connecting-IP`), approximately and per Cloudflare location. Above that the route answers `429` with `Retry-After: 60` and the tab shows its usual unavailable rows. The limiter fails open: a missing binding or a limiter error never blocks a visitor, because it protects the upstream source and is not an access control. See [cloudflare-deployment.md](cloudflare-deployment.md#deploying-your-own-copy) for the binding.
- Upstream responses are validated with Zod and bounded by timeouts and, for news feeds, 2 MiB; see [market-data.md](market-data.md). News article bodies are never fetched.

## Secrets and personal data

- Credentials are Worker secrets, or the gitignored `.dev.vars` locally. Sign-in links and their tokens are never logged. Never share `build/`, which can contain a copy of `.dev.vars` (see [cloudflare-deployment.md](cloudflare-deployment.md)).
- Without an account the app stores no personal data. Signed-in records are scoped to the account, exportable and deletable at any time, and deleted after a retention period once access lapses ([cloud-finance-setup.md](cloud-finance-setup.md#retention-of-lapsed-records)).
- The SEPA archive used to build the price basket is untrusted input, parsed under size, entry-count and compression-ratio limits ([product-price-feed.md](product-price-feed.md#refreshing-monthly)).

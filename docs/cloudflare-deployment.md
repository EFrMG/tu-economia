# Cloudflare Workers deployment

The app deploys as one Cloudflare Worker. `workers/app.ts` is the entry and `wrangler.jsonc` declares the runtime; the Cloudflare Vite plugin bundles the server entry together with the static assets in `build/client`.

## Workers Builds

Connect the GitHub repository to a Cloudflare Worker at the repository root. In **Settings → Build**, set:

- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Deploy command: `pnpm run deploy`

Use `pnpm run deploy`, not `pnpm deploy`, which is a built-in pnpm command and never reaches the `deploy` script.

Set these build variables:

| Variable                  | Value                         | Purpose                                                                 |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `NODE_VERSION`            | `22.23.3`                     | Match the version pinned in `.node-version` and used by GitHub Actions. |
| `PNPM_VERSION`            | `11.21.0`                     | Match `packageManager`, `mise.toml`, and the lockfile.                  |
| `SKIP_DEPENDENCY_INSTALL` | `1`                           | Let the build command perform the frozen-lockfile install once.         |
| `VITE_SITE_URL`           | The production HTTPS site URL | Canonical and OpenGraph URLs. Without it the build succeeds but the Worker answers every page with a 500. |

Build variables only cover the build. The D1 binding, flags and secrets are runtime configuration; see [cloud-finance-setup.md](cloud-finance-setup.md).

The build copies a local `.dev.vars` into `build/server/.dev.vars` so `pnpm preview` can read local secrets. `wrangler deploy` does not upload it and `build/` is gitignored, but never share the `build/` output; rotate any credential that appears in a shared artifact.

## First production configuration

Before enabling accounts on the deployed Worker:

1. Set `VITE_SITE_URL` (build variable) and `AUTH_BASE_URL` (runtime variable) to the same HTTPS origin, and serve the Worker there. The `workers.dev` address works as long as both name it; moving to a custom domain changes the origin, so update both variables, the Google redirect URI and the Mercado Pago notification URL together. Email delivery needs a sending domain whose DNS you control, which `workers.dev` is not.
2. Register the Google redirect URI and the Mercado Pago notification URL for that origin; see [cloud-finance-setup.md](cloud-finance-setup.md#sign-in) and [billing.md](billing.md#provider-setup).
3. Apply the migrations to the remote database; see [cloud-finance-setup.md](cloud-finance-setup.md#database).
4. Leave `AUTH_ACCOUNTS_ENABLED`, `FINANCE_STORAGE_ENABLED` and `BILLING_ENABLED` at `"false"` in `wrangler.jsonc` until the flows in [cloud-finance-setup.md](cloud-finance-setup.md) and [billing.md](billing.md) pass against the deployed Worker. This repository's file enables all three for its own Worker.
5. Leave `EQUITIES_BYMA_ENABLED` at `"false"`; see [market-data.md](market-data.md#the-byma-gate).

## Checks

GitHub Actions runs `pnpm test` and a Wrangler dry run (`pnpm exec wrangler deploy --dry-run`), which validates the Worker bundle without Cloudflare credentials. Run it locally after `pnpm build`.

On a deployed URL, check `/dashboard`, `/indicadores`, `/noticias`, `/privacy` and that the fonts load, and on `/acciones`:

- the Empresas list fills in, every issuer resolves (none reads "no identificado"), and the report links open documents on sec.gov; then one company (`/acciones?panel=empresas&empresa=YPF`) shows its filings and figures. The SEC throttles some cloud addresses, so a 403 here means the Worker is being refused;
- `/api-status` shows a "SEC EDGAR" row that is not `failed`;
- while `EQUITIES_BYMA_ENABLED` is off, the effects listed under [the BYMA gate](market-data.md#the-byma-gate) hold and the Workers Logs show no request to `open.bymadata.com.ar`. If the flag is ever turned on, check the BYMA panel too.

## Deploying your own copy

`wrangler.jsonc` binds the project's D1 database as `DB` by ID, which another Cloudflare account cannot use. On a different account, run `wrangler d1 create tu-economia`, replace `database_id` and `vars.AUTH_BASE_URL` in `wrangler.jsonc` and apply the migrations as described in [cloud-finance-setup.md](cloud-finance-setup.md). Set `AUTH_ACCOUNTS_ENABLED`, `FINANCE_STORAGE_ENABLED` and `BILLING_ENABLED` to `"false"` unless you configure those features; the public pages need nothing else.

`wrangler.jsonc` also declares the `PRICES_LIMITER` rate-limit binding (see [security.md](security.md#protecting-upstream-sources)). Its `namespace_id` is only an identifier, unique among the account's limiters; there is no resource to create.

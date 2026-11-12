# Tu Economía. Contributor Guide

Operational rules for working in this repository.

[README.md](README.md) has the product philosophy, setup and route overview; [docs/README.md](docs/README.md) indexes the feature and operations guides (deployment, accounts, billing, prices, news sources) and describes `docs/sources/`, the archived provider manuals; the full working design reference is [DESIGN.md](DESIGN.md).

## Product and voice

- Keep user-facing Spanish professional, formal, and reassuring. Prioritize clear data over visual density or drama.

## Codebase structure

- `app/`: the React Router v8 application.
  - `app/routes.ts`: the single route manifest. Every route is declared there; nothing auto-registers.
  - `app/routes/`: route modules. `*.ts` files (without JSX) are resource endpoints: `robots.ts`, `sitemap.ts`, `inflation-history.ts`, `prices-api.ts`, and the account, billing and storage handlers (`auth-api.ts`, `account-api.ts`, `billing-api.ts`, `billing-webhook-api.ts`, `finance-export-api.ts`). `*.tsx` files are pages.
  - `app/layouts/`: page shells: `marketing.tsx` wraps the public pages (home, `api-status`, `docs`, `privacy`, `terms`); `terminal.tsx` wraps the dashboard app (`dashboard` (Resumen), `dolar`, `precios`, `tasas`, `actividad`, `acciones`, `noticias`, `mi-economia`).
  - `app/components/ui/`: atomized, reusable primitives (Button, Card, Sparkline) with zero side effects.
  - `app/components/features/`: domain components (ExchangeRateCard, PersonalFinanceTracker).
  - `app/components/layout/`: page chrome (Navbar, Sidebar, TopBar, Footer).
  - `app/lib/`: framework-agnostic logic and data access. Pairs like `indicators.ts` / `indicators.server.ts` split a module into a client-safe half and a server-only half; `*.test.ts` files are colocated next to the code they test. `~/*` imports map to `app/*`.
  - `app/css/`: the Tailwind CSS v4 files described under "Styling and design" below.
- `workers/app.ts`: the Cloudflare Worker entry (the request handler and the daily retention cron); `wrangler.jsonc` configures the runtime.
- `migrations/`: Cloudflare D1 SQL migrations (personal finance, auth, billing).
- `scripts/`: the maintainer-run Python builds of the Precios data (`build-price-basket.py`, `price-basket.json`; see `docs/product-price-feed.md`) and the Tasas data (`build-transparency-rates.py`; see `docs/transparency-rates.md`), and the CLA tooling (`accept-cla.py`, `verify-cla.py`, the shared `cla.py`). The Python tests are `test_build_price_basket.py`, `test_build_transparency_rates.py` and `test_cla.py`. Pyright type-checks them with `pyrightconfig.json` at the root.
- `cla/`: `accepted/` holds the contributors' acceptance records and `versions/` the published CLA texts; see "License and CLA" below.
- `docs/`: feature and operations guides, indexed in `docs/README.md`.
- `build/client/assets/*.css`: generated CSS; the only place Tailwind reports unknown classes.

## Architecture

- This is React Router v8. Use loaders for data and actions for mutations; prefer URL/search-param state. Context is only for global UI state that is not URL state.
- Server-only code must use the `.server.ts` suffix. Use `.ts` for modules without JSX.
- Prefer `const` components and TypeScript interfaces for props. Keep calculation/data logic in `app/lib` or colocated helpers, separate from presentation.

## Data, errors, and SEO

- Validate upstream responses with Zod at the boundary. Downstream code consumes typed values only.
- Preserve the promise-per-key caching in `app/lib/promise-cache.server.ts`, shared by every upstream module; see [docs/market-data.md](docs/market-data.md#shared-behavior).
- Data routes need explicit loading and error states, including an `ErrorBoundary` where applicable.
- Every page route exports `meta` through `pageMeta` from `~/lib/meta`; do not hand-roll metadata. Placeholder routes set `noIndex: true`. `VITE_SITE_URL` provides absolute URLs.

## License and CLA

- `LICENSE` is PolyForm Noncommercial 1.0.0; do not edit it. Contributors accept `CLA.md` with `python3 scripts/accept-cla.py`, which writes `cla/accepted/<github-user-id>.md`. Never hand-write or edit acceptance records.
- Each published CLA version is archived unchanged as `cla/versions/<version>.md`, and the CLA check fails unless `CLA.md` equals the archive of its own `**Version:**`. Changing `CLA.md` therefore means bumping the version and copying the new text into `cla/versions/`. Editing a version in place and refreshing its archive is acceptable only while `cla/accepted/` holds no record for it.

## Styling and design

[DESIGN.md](DESIGN.md) is the working reference for the visual system (palette, type, spacing, shape, data states); read it before UI work, and treat its Implementation Mandates as rules. What follows is about writing the code.

- Tailwind CSS v4 files are deliberately split:
  - `app/css/tailwind-theme.css`: `@theme` tokens.
  - `app/css/tailwind-general.css`: base aliases and shared utilities.
  - `app/css/tailwind-reset.css`: global semantic defaults.
  - `app/css/typefaces.css`: font loading.
- Never hardcode color: no `text-white`, `text-black`, or hex values in JSX. Reference the tokens defined in `tailwind-theme.css`.
- Reuse `hocus:`, `stack`, `stack-*`, `opacity-less`, `btn-click-soft`, `terminal-grid`, `glass`, and `.card` before creating equivalents.
- `prettier-plugin-tailwindcss` owns class order (configured in `.prettierrc`, reading `app/app.css`). Write utilities in whatever order reads best and let `pnpm run format` sort them; project utilities such as `stack-4` and custom variants such as `hocus:` sort by the stylesheet, not alphabetically, which is fine.
- `@theme` namespaces are semantic: `--font-*` is font-family and `--text-*` is font-size. Tailwind derives utilities from the key prefix, so a token named into the wrong namespace silently breaks a built-in utility; do not add weight or colour aliases there. Raw-CSS aliases `--bkg-clr` and `--text-clr*` belong in `@layer base`; JSX uses palette utilities.

## Motion and accessibility

- Use `h-dvh` for full-height shells.
- JavaScript animation must honor `prefers-reduced-motion`.
- Closed off-canvas navigation must be removed from tab order (`invisible` / `md:visible`, not translation alone).
- Icon-only controls need `aria-label`; decorative icons and visual layers need `aria-hidden="true"`.

## Writing and formatting

- Do not wrap prose, documentation, or code comments at a fixed column cap. Let lines run naturally and rely on editor soft wrap; break a comment only when the sentence itself gives a reason to; separating a clause, matching a list's structure, or keeping the text beside the line it describes.
- Space code vertically so it can be scanned; Prettier does not enforce this, so apply it by hand:
  - Put a blank line above and below `return`, `throw`, `if`, `for`/`while`/`do`, `switch`, and `try` statements, and above and below any statement that spans multiple lines (multi-line calls, declarations, effects, callbacks). The first or last statement of a block needs no blank line against the brace.
  - A single-line variable declaration may sit flush against the next statement when that statement uses it (e.g. `const gap = …;` directly followed by `if (gap === undefined) …` or `return gap`). Consecutive one-line guard clauses (`if (!x) return;`) may be grouped.
  - Separate variable declarations from each other with a blank line when they belong to different concerns; related one-line declarations may stay together.
  - Group related one-line statements (e.g. a run of `searchParams.delete(…)` calls) and separate the groups with a blank line.

## Verification

Run before declaring implementation work complete (formatting, lint, TypeScript and Python type checks, unit tests, Python script tests and build):

```sh
mise exec -- pnpm test
```

Keep automated tests focused on server, data, and calculation logic. Do not add frontend component tests unless the user requests them.

For token, reset, or utility changes, also inspect generated `build/client/assets/*.css`: Tailwind does not fail on unknown classes, so a token mistake only shows up in the generated CSS.

After work that changes the Worker bundle, `mise exec -- pnpm exec wrangler deploy --dry-run` validates it locally.

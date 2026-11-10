# Tu Economía

Economic monitoring platform for Argentina.

## 1. Project Philosophy

### 1.1 Purpose and Vision

**Tu Economía** provides a precise, minimalist interface for monitoring currency exchange rates and economic indicators.

It serves as a reliable reference point for freelancers, remote workers, and savers who need to preserve purchasing power and make independent, informed decisions without the noise of economic anxiety.

### 1.2 Argentine Economic Context

In Argentina, volatility and uncertainty are daily realities. The "Dólar" is more than a currency; it is a unit of account and a measure of value for most of the population.

Centralizing all relevant numbers in one place gives people a coherent view of an otherwise fragmented landscape.

## 2. Tech Stack and Development

### 2.1 Libraries and Tooling

- **Styling:** Tailwind CSS v4.
- **Fonts:** Self-hosted variable Geist, Inter, and JetBrains Mono files sourced from Fontsource 5.3.0.
- **Icons:** react-icons.
- **Charts:** Recharts for the historical comparisons.
- **Routing:** React Router v8 (SSR).
- **Validation:** Zod, applied at the API boundary.
- **State Management:** Prefer URL state and Router loaders.
- **Animation:** motion for React.
- **Smooth scroll:** Lenis.
- **Hosting:** Cloudflare Workers, with static assets served by the same deployment.
- **Accounts and storage:** Better Auth and Cloudflare D1, email through Resend, and subscriptions through Mercado Pago.
- **Tests:** Vitest, for server, data and calculation logic.

#### 2.1.1 Styling and Design System

The working design reference is [DESIGN.md](DESIGN.md).

The interface reads as a calm, reliable financial instrument rather than a news ticker.

It prioritizes information density without visual noise; depth is built from tonal layering, low-contrast outlines, and restrained glows.

Accent colors are strictly role-based: primary blue for actions and active states, terminal green for success and positive movement, muted amber for neutral or informational states, and red only for negative movement or genuine risk. All accents use low-opacity fills with high-opacity strokes.

#### 2.1.2 Data Sources

Page data is read in React Router v8 loaders. Slow or optional data, such as the dashboard quotations, streams in behind a loading state, so a slow upstream never blocks the page. The app draws from these upstream sources:

- [Dólar API](https://dolarapi.com/) for live rates;
- [ArgentinaDatos](https://api.argentinadatos.com/) for historical series and macroeconomic indicators;
- [Datos Argentina](https://apis.datos.gob.ar/) for EMAE activity data;
- [SEC EDGAR](https://www.sec.gov/edgar/search/), the SEC's public filing system, for the filings and annual figures of Argentine companies listed in the US (public information that may be copied and redistributed; not yet verified against the live API);
- [BYMA Open Data](https://open.bymadata.com.ar/), BYMA's free public feed, for CEDEAR, S&P Merval leader and index quotations, delayed about 20 minutes. It is switched off by `EQUITIES_BYMA_ENABLED` until BYMA authorizes displaying its data, and has not been verified against the live API either; see [docs/market-data.md](docs/market-data.md);
- RSS feeds from Argentine news publishers;
- the SEPA retail-price archive and the unofficial Precios Claros API for product prices.

Every response is validated at the boundary, and a failing source degrades only its own cards: stale live quotes are labelled with their fetch time, and missing history shows as `s/d` (_Sin Datos_). Exchange rates, indicators, EMAE, company filings, equities, caching and fallbacks are in [docs/market-data.md](docs/market-data.md), news in [docs/rss-sources.md](docs/rss-sources.md) and product prices in [docs/product-price-feed.md](docs/product-price-feed.md).

##### 2.1.2.1 Search Entities

Search records have a category, stable ID, display title, aliases, and an internal target with optional URL parameters and a focusable element ID. The index covers the five exchange-rate cards, identified by their Dólar API `casa` code and indexed locally; selecting one shares `?rate=<casa>` (and focuses its card). It also covers the Acciones panels, which open `/acciones?panel=<panel>`: "Empresas argentinas en la SEC" (also "SEC", "EDGAR", "balances") and "Calculadora de precio teórico de CEDEAR" (also "calculadora cedear", "precio teórico", "ratio") always, and, only while `EQUITIES_BYMA_ENABLED` is on, the quotations panel ("CEDEARs y acciones líderes", also "CEDEAR" or "Merval"). The flag reaches the client through the terminal layout's loader. Single tickers and companies are not indexed.

The shared model and matching logic live in `app/lib/search-entities.ts`; the rate index lives in `app/lib/exchange-rate-search.ts` and the panel index in `app/lib/equity-search.ts`. A record belongs in the index only when its destination can reveal the selected item, so search never returns a dead entry.

### 2.2 Code Quality Standards

- Strict TypeScript configurations are non-negotiable.
- **Styling:** Use the custom Tailwind v4 utilities in `/app/css` and the design tokens in `tailwind-theme.css`; avoid hardcoded values in JSX.
- The full contributor rules, including the codebase layout and verification steps, are in [AGENTS.md](AGENTS.md).

#### 2.2.1 Component Architecture

Components are organized by responsibility:

- **UI Components** (`app/components/ui`): Atomized, reusable elements (Button, Card, Sparkline) with zero side effects.
- **Feature Components** (`app/components/features`): Domain-specific logic (ExchangeRateCard, HistoricalExchangeChart, PersonalFinanceTracker).
- **Layout Components** (`app/components/layout`): Page chrome (Navbar, Sidebar, TopBar, Footer).
- **Page shells** (`app/layouts`): `marketing` for the front pages and `terminal` for the dashboard app.

#### 2.2.2 Quirks

- **Meta Tags:** Every page route builds its title, canonical, OpenGraph and Twitter tags through the `pageMeta` helper in `app/lib/meta.ts`, which attaches the shared 1200×630 social preview image (`app/assets/OG-image.png`).
- **Internationalization:** While the UI is in Spanish, the codebase and documentation remain in English to maintain engineering standards.

### 2.3 Build

Vite serves as the build tool and development server.

The Cloudflare Vite plugin runs server code in the Workers runtime during development and preview.

The project is pnpm-managed; `mise.toml` and `packageManager` in `package.json` pin the same pnpm version, and `.node-version` pins the Node.js build version.

1. Clone the repository.
2. Provision pnpm: `mise install`.
3. Install dependencies: `mise exec -- pnpm install --frozen-lockfile`.
4. Local D1 (Miniflare) starts empty. See [docs/cloud-finance-setup.md](docs/cloud-finance-setup.md).
5. Start the development server: `mise exec -- pnpm dev`.

> For a local production preview, run `mise exec -- pnpm build` followed by `mise exec -- pnpm preview`.

> To validate the Worker bundle and assets without publishing, run `mise exec -- pnpm exec wrangler deploy --dry-run` after building.

Before committing, run `mise exec -- pnpm test`. It groups formatting, lint, typecheck, unit tests, and the build in one command.

> [!NOTE]
> Tailwind does not error on unknown classes, so a token mistake only shows up in the generated CSS.

##### 2.3.1.1 Dev Preview Params

Production builds ignore these.

| Flag                                                                                                                                      | Route(s)                                                                                                                                                                                                                 | Effect                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `?preview=unavailable`                                                                                                                    | `/dashboard`, `/analisis`, `/noticias`, `/indicadores`, `/acciones`, `/acciones?panel=empresas&empresa=YPF`, `/acciones?panel=calculadora` (manual-rate state), `/acciones?panel=acciones` (BYMA on only), `/api-status` | Simulates unavailable data states |
| `?preview=sent`                                                                                                                           | `/mi-economia?tab=usuario`                                                                                                                                                                                               | Shows "link sent" confirmation    |
| `?preview=error`                                                                                                                          | `/mi-economia?tab=usuario`                                                                                                                                                                                               | Shows retry/error notice          |
| To review route-level error screens, open a path that does not exist for the 404 view, or trigger a server error in development for 500s. |

#### 2.3.1 Configuration

The public pages need no configuration beyond `VITE_SITE_URL`, the absolute origin used for canonical and OpenGraph URLs. **Set as a Cloudflare build variable**; otherwise, social cards point at localhost by default.

Accounts, cloud finance storage and billing are runtime configuration (Worker variables, secrets and the D1 binding), documented in [docs/cloud-finance-setup.md](docs/cloud-finance-setup.md).

`EQUITIES_BYMA_ENABLED` switches the BYMA quotations on `/acciones` on with the literal `"true"`. **It stays off until BYMA authorizes displaying its data**; while off, no request reaches BYMA. See [docs/market-data.md](docs/market-data.md#the-byma-gate).

Deployment steps are in [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md).

### 2.4 Routes

| Route                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Home. Introduction to the quotations, history and news, with their sources and methodology                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/dashboard`         | Live exchange rates with sparklines, daily variation, and stale-data fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/analisis`          | Blue–Oficial gap over time, purchasing-power estimate, and deposit-vs-inflation comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/indicadores`       | Monthly and annual inflation, 30-day deposit rate, UVA, country risk, and EMAE activity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/acciones`          | Argentine companies listed in the US (`?panel=empresas`, `&empresa=<ticker>`): latest annual report linked to sec.gov, recent filings and annual figures as filed, from SEC EDGAR. A CEDEAR theoretical-price calculator (`?panel=calculadora`, `&precio`, `ratio`, `referencia`, `tc`, `mercado`): the visitor types the underlying's price and the ratio, the CCL or MEP comes from Dólar API. While `EQUITIES_BYMA_ENABLED` is on, also a quotations panel (`?panel=acciones`) with the index strip and the CEDEARs and S&P Merval leaders ranked by traded amount; BYMA data delayed about 20 minutes |
| `/noticias`          | Aggregate of economic news                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/mi-economia`       | Personal salary and budget tracker in tabs (`?tab=usuario`, `presupuesto`, `planificacion`, `precios`); records stored per account in D1; editing requires an active trial or paid subscription; signed-out visitors browse a read-only example. There's also a price tracker for consumer goods                                                                                                                                                                                                                                                                                                          |
| `/api-status`        | Health and cache status for all upstream data sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/docs`              | Sources, calculations, update frequency, and limits of the data shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/privacy`, `/terms` | Privacy policy and Service terms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

#### 2.4.1 Mi economía

_Mi economía_ is a cloud-synced **Salary and Savings Tracker**. Signed-in users can:

- Define monthly income and allocate budgets across spending categories.
- Compare planned allocations with expenses they record manually, without presenting the result as a bank balance.
- Plan upcoming one-time and monthly expenses, and track savings goals.
- Compare salary purchasing power across months when published inflation data covers the period.
- Consult reference prices of everyday products near their city.

Accounts, cloud storage and billing stay off until they are configured; see [docs/cloud-finance-setup.md](docs/cloud-finance-setup.md). [docs/personal-finance.md](docs/personal-finance.md) covers the implementation.

### 2.5 Endpoints

Declared in `app/routes.ts`.

- `/api/auth/*` (sign-in).
- `/api/account` (account deletion).
- `/api/finance-export` (JSON copy of records).
- `/api/billing` and `/api/billing/webhook` (subscription).
- `/resources/prices` and `/resources/inflation-history` (data for client components).
- `robots.txt` and `sitemap.xml`.

### 2.6 Further Documentation

[docs/README.md](docs/README.md) indexes the feature and operations guides: deployment, accounts and cloud storage, _Mi economía_, billing, market data, the product-price feed, the news sources and security.

## 3. Security and Legal Considerations

### 3.1 Data Privacy

Without an account, the platform stores no personal financial data; it acts as a read-only interface for public economic information. Personal records are stored only when a signed-in user saves them in _Mi economía_, scoped to that account, and the user can export or delete them at any time.

### 3.2 Disclaimer

All financial data provided is for informational purposes only. This platform is **not a financial advisor**. Users should consult professionals before making significant investment decisions.

### 3.3 License and Contributing

The source is published under the [PolyForm Noncommercial License 1.0.0](LICENSE): free to use for noncommercial purposes. It is source-available, not open source.

Contributions are welcome under the [Individual Contributor License Agreement](CLA.md); [CONTRIBUTING.md](CONTRIBUTING.md) explains what it means and how to accept it.

## 4. Not Built (yet)

- Stock prices on the dashboard;
- More cryptocurrency rates beyond the USDT quotation;
- Secondary market alerts;
- Savings-scenario tools for longer-term financial planning.

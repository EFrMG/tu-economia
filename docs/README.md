# Documentation

Feature and operations guides. Overview, setup and commands are in the [root README](../README.md), coding rules in [AGENTS.md](../AGENTS.md) and the design system in [DESIGN.md](../DESIGN.md).

[`sources/`](sources/) archives the provider material the data modules are written against, converted to text for reference: the BCRA API manuals behind [market-data.md](market-data.md) and [transparency-rates.md](transparency-rates.md), and the INDEC semester calendar behind `app/lib/indec-calendar.ts`. The files are documentation only; no code reads them at runtime.

| Document | Read it when you are |
| --- | --- |
| [cloudflare-deployment.md](cloudflare-deployment.md) | Deploying the Worker, or running your own copy |
| [cloud-finance-setup.md](cloud-finance-setup.md) | Configuring accounts, D1 and email, or testing sign-in and record retention locally |
| [personal-finance.md](personal-finance.md) | Working on *Mi economía*: its tabs, data model and calculations |
| [billing.md](billing.md) | Working on the Mercado Pago subscription |
| [product-price-feed.md](product-price-feed.md) | Working on the *Precios* tab of *Mi economía*, or refreshing its data |
| [market-data.md](market-data.md) | Working on exchange rates, indicators, activity data or the Acciones page, or their caching and fallbacks |
| [transparency-rates.md](transparency-rates.md) | Working on the Tasas page, or refreshing its loan and card data |
| [rss-sources.md](rss-sources.md) | Adding or replacing a news source |
| [security.md](security.md) | Adding a route, or changing headers, request guards or rate limits |

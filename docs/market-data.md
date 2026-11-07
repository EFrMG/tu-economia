# Market data

Exchange rates, economic indicators and activity data are read in loaders from public APIs, validated with Zod and cached per source. News and product prices have their own guides: [rss-sources.md](rss-sources.md) and [product-price-feed.md](product-price-feed.md).

| Source | Used for | Module | Cache | Timeout |
| --- | --- | --- | --- | --- |
| [Dólar API](https://dolarapi.com/) `/v1/dolares` | Live exchange rates | `exchange-rates.server.ts` | 60 s | 8 s |
| [ArgentinaDatos](https://api.argentinadatos.com/) `/v1/cotizaciones/dolares/<casa>` | Daily closes for variation and sparklines | `exchange-rates.server.ts` | 10 min | 8 s |
| ArgentinaDatos `/v1/finanzas/…` | Inflation, deposit rate, UVA, country risk | `indicators.server.ts` | 30 min | 8 s |
| [Datos Argentina](https://apis.datos.gob.ar/) series API, then its CSV export | EMAE activity | `economic-activity.server.ts` | 30 min | 3 s (API), 8 s (CSV) |

All modules live in `app/lib/`.

## Exchange rates

`blue` is the dashboard's highlighted rate and the grid shows `oficial`, `bolsa`, `contadoconliqui` and `cripto` (`HIGHLIGHT_CASA` and `GRID_CASAS`). A live response without `blue` is rejected. One missing a grid rate is cached for only 5 s.

- **Variation**: the live sale price against the last close before today (Argentine calendar day), so a close already published for today is never compared with itself. History keeps 90 calendar days and the sparkline draws the last 30 points. History is optional: if it fails, the dashboard still renders with the variation as `s/d` (*sin datos*).
- **Stale fallback**: when a live request fails, the last successful response is served for up to 15 minutes from the moment it was fetched, labelled with that time. Failed attempts do not extend the window. Past it, the rate cards show as unavailable while the history charts load independently.

## Indicators

`/indicadores` shows monthly and annual inflation, the 30-day deposit rate, UVA and country risk. The series are attributed to the BCRA, and country risk to Ámbito.

- Each series is fetched on its own, so one failure leaves the other indicators visible. Repeated dates in a series collapse to one point.
- Each card discloses the series' period, unit and source, and copies those details on click.
- The deposit rate is never presented as a monetary-policy rate. The BCRA no longer announces one, and the app substitutes nothing for it.
- `/resources/inflation-history` serves the monthly inflation series to the client components that compare purchasing power and deposits with inflation. A successful response is public (one hour in browsers, one day in shared caches); an unavailable one is `private, no-store`.

## Economic activity (EMAE)

The panel shows year-over-year activity, the seasonally adjusted monthly change and the last 12 observations, converted from fractions to percentages. It reads INDEC's series through the Datos Argentina API and falls back to the CSV export of the same series when the API fails. The panel is unavailable only when both fail.

## Shared behavior

- **Caching** (`promise-cache.server.ts`): concurrent requests for a key share one upstream fetch, and a rejected promise is evicted. A failed key backs off for 5 s, doubling to a 30 s cap, and callers get the same error meanwhile; a success resets it and a key quiet for 5 minutes is forgotten. The cap stays under the 30 s first delay of the browser's automatic retry (`use-failed-data-retry.ts`, doubling to 5 minutes, only while the tab is visible and idle), so a retry always reaches upstream. At most 256 failure records are kept.
- **Timeouts** (`upstream-timeout.server.ts`): every upstream request has a hard deadline that settles even when the fetch ignores its abort signal.
- **Streaming**: slow or optional data, such as the dashboard quotations, streams in behind a loading state, so a slow upstream never blocks the page.
- **Dev preview**: `?preview=unavailable` simulates the unavailable state of these pages and resources; production builds ignore it.

## API status

`/api-status` lists each source's last result: `not-checked`, `fetched`, `cached`, `stale`, `partial` or `failed`, with the last success and failure times. It runs the application's own data paths instead of a separate probe, within a 10 s limit, and a source still unchecked when the limit passes shows as `failed`. The health is kept in memory, so it describes the Worker instance that answered.

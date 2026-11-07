# Product-price feed

The *Precios* tab of *Mi economía* shows what common products cost at the supermarket chains near the visitor's chosen city. It is a reference, not a full catalogue.

## Sources

### SEPA archive (official, licensed)

- Dataset: [Precios SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios), catalogue API `https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios`.
- Publisher: Subsecretaría de Defensa del Consumidor y Lealtad Comercial.
- License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is required and changes must be indicated. Site terms: <https://www.preciosclaros.gob.ar/terminos_y_condiciones>.
- One ZIP per weekday (`sepa_lunes.zip` through `sepa_domingo.zip`, about 320 MB and 14 million rows each); the newest has the latest `last_modified`. Only the last seven days exist.
- Layout: an outer ZIP holds one inner ZIP per commerce (`sepa_<n>_comercio-sepa-<id>_<date>.zip`), each with `comercio.csv`, `sucursales.csv` and `productos.csv`, `|`-delimited, UTF-8 with BOM, ending in an `Última actualización: <date>` footer line (spelled several ways).

#### Quirks the build handles

- `productos_ean` is a flag, not the barcode. Even with `1`, chains send in-store and variable-weight codes (`2…`), short codes and bad checksums. A GTIN is kept only when it passes the GS1 check digit and is not a restricted-circulation number. It is stored zero-padded to 13 digits, the id the live API uses (`0000040084107`, not `40084107`).
- The same GTIN almost never has the same description across chains (0.4 % agree). DIA, Toledo and Coop. Obrera truncate at 20 to 25 characters; Coto's are the most complete.
- Brands are inconsistent (`LA SE`, `GRANI`, manufacturer names, `SIN MARCA`, blanks), and sizes disagree: Carrefour reports `1 UNI` and puts the real size in its reference columns, Vea writes `.75 ml` for 750 ml.
- `comercio_ultima_actualizacion` can be years stale while the footer is current, so the footer is the freshness date. A commerce whose footer is more than 30 days behind the newest is left out, and an inner ZIP can be empty.
- Fuel-station shops (Axion, Deheza, Estación Lima) and appliance chains are excluded; only the supermarkets in `SUPERMARKETS` are kept.
- California Supermercados reports implausible prices (a 560 g loaf at $174) and is in no group.

### Precios Claros API (live, unofficial)

- Base `https://d3e6htiiul5ek9.cloudfront.net/prod`, with the `x-api-key` header set to the public key from the preciosclaros.gob.ar frontend (in `app/lib/prices.server.ts`).
- `/producto?id_producto=<GTIN>&array_sucursales=<ids>&limit=<n>` (at most 50 branches) returns `sucursales[]` with `comercioId`, `banderaId`, `banderaDescripcion` and `preciosProducto.precioLista`; branches without the product return a `message`. Branch ids are the archive's `commerce-banner-branch`, zero padding included (`2-1-004`).
- Only real barcodes exist. Weighed in-store codes (produce, meat, pan francés) are never returned.
- Carrefour (commerce 10) is in the archive but not in the API: `/sucursales` never returns it, and Carrefour-only GTINs answer `Producto inexistente`.
- The CDN blocks requests with no User-Agent (a Worker's default) or with `node`/`undici`. We send `TuEconomia/1.0 (+<site URL>)`.
- Text search (`/productos?string=`) returns `status: 500` for any query matching a brandless product ("pan", "huevos", "lactal"), so the app does not use it.
- Risks: no published terms, no stability guarantee, a shared key, and the CDN can block us at any time. A failure is isolated per item and shows `s/d`.

## How the tab works

- **Basket** (`scripts/price-basket.json`): 25 single products, 3 groups and 9 fresh items in three sections, chosen from the archive for coverage. Four defaults: leche entera, pan lactal, huevos, yerba.
  - *Product*: one GTIN priced live.
  - *Group* (huevos per dozen, pan lactal and azúcar per kg): a set of GTINs, each with its size in the group's unit; every chain shows its cheapest member per unit. Only members sold near the location are requested.
  - *Fresh*: median list price per kg from the archive, per chain, over the location's branches, after dropping prices outside 0.33× to 3× the national median. Grades are mixed (common and premium mince, different asado cuts), as the footer states.
- **Search**: a static index of packaged products sold by at least five chains, or four within a basket category, plus every basket product and group member (about 6,000 products and 225 KB gzipped, at `public/precios/catalogo-<date>.json`). The browser downloads it on the first search and matches every typed word as a word prefix, ignoring accents. Other chains' descriptions are searchable but not shown.
- **Branches**: for each location in `PRICE_LOCATIONS`, the nearest two branches of every chain banner within 30 km, at most 50, skipping commerces the API does not serve. They are fixed in the generated data, so no `/sucursales` call is made.
- **Chains** are labelled by commerce, or by banner where one company runs stores people know apart (Vea, Disco, Jumbo); formats of one brand share a name (Carrefour Express, Market and Maxi are "Carrefour"). See `CHAIN_LABELS` in `app/lib/prices.ts`.
- **Limits**: up to 8 saved items per visitor, in local storage. A request makes at most one upstream call per GTIN, or per group member sold near the location, cached per location and GTIN for 30 minutes with shared promises. `app/lib/prices-budget.test.ts` fails if the most expensive set of 8 saved items in any location reaches the 50 subrequests a Worker invocation allows, so rerun the tests after refreshing the basket. The search index is a static asset and costs no Worker request.
- **Archive fallback**: when the live API fails for a basket product or group, the row shows the archive's median list price per chain, labelled "Referencia SEPA" with the archive date (amber, not red). `build` writes it as `archive` in `app/lib/price-basket-server.generated.json`: one median per `commerce-banner` for each basket GTIN and group member (about 10 KB), plus the banners with a live branch near each location, so a location lists only chains the live API would have asked. Carrefour is left out because the live API does not serve it, and a product outside the basket (found through search) still shows `s/d`. The archive is nationwide per banner, not per branch, and at most five weeks old. `build` stops with an instruction when the aggregate predates the per-banner script; rerun `aggregate`.
- **Known gaps**: pan lactal has no price where only La Anónima or Changomas operate (Patagonia), because neither reports packaged sliced bread; pollo entero and pan francés come from three chains.

> **Attribution** is one footer for the section: source, publisher, license with links, "procesados por Tu Economía" with the archive date, and the list-price and fresh-median caveats.

## Refreshing (monthly)

The `Refresh prices` workflow (`.github/workflows/refresh-prices.yml`) runs these steps on the 3rd of every month and on demand from the Actions tab. It commits to the branch as `github-actions[bot]` only if `pnpm test` and a Wrangler dry run pass, and commits nothing when the basket is unchanged. A failure, such as a basket GTIN that left the archive or a source that refuses the runner, fails the run and sends an email; then do the steps below by hand. The push needs no branch protection rule on `master` blocking `github-actions[bot]`.

The build is a standard-library Python script (3.11 or later), never run in the Worker. The archive is untrusted input: the download is accepted only over HTTPS from `datos.produccion.gob.ar` (checked after redirects, capped at 1 GB), and both ZIP levels are checked for entry count, declared size and compression ratio before anything is decompressed.

Keep the work directory outside the repository.

```sh
python3 -I scripts/build-price-basket.py download --work ~/sepa
python3 -I scripts/build-price-basket.py aggregate --archive ~/sepa/sepa_<día>.zip --work ~/sepa
python3 -I scripts/build-price-basket.py candidates --work ~/sepa # optional: ~/sepa/candidates.md, to review or replace picks
python3 -I scripts/build-price-basket.py build --work ~/sepa
```

`build` validates `scripts/price-basket.json` against the archive and fails on a GTIN that disappeared; replace it from `candidates.md`. It writes `app/lib/price-basket.generated.json` (client), `app/lib/price-basket-server.generated.json` (server only, with the `archive` fallback prices) and the search index, removing the previous one. Commit those files and run `mise exec -- pnpm test`.

## Fallback if the API stops working

The basket falls back to the archive automatically (see "Archive fallback" above), for basket products and groups only. Extending it to every searchable product would need a median per product and chain for about 6,000 products, a few hundred KB more in the Worker bundle. That is not built.

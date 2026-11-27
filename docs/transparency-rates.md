# Tasas

`/tasas` compares personal loans, UVA mortgages and credit cards per lender, from what each lender reports to the BCRA under the Régimen de Transparencia. It has three panels, chosen with `?panel=`: `prestamos` (the default), `hipotecarios` and `tarjetas`.

## Source

BCRA Régimen de Transparencia v1.0, `https://api.bcra.gob.ar/transparencia/v1.0/`, no key; the manual is linked from `https://www.bcra.gob.ar/apis-banco-central/`. The page reads three endpoints:

- `Prestamos/Personales`: one row per product, with the maximum effective annual rate (`tasaEfectivaAnualMaxima`), the maximum total financial cost (`costoFinancieroEfectivoTotalMaximo`, CFT), maximum term in months, amount range, minimum income, beneficiary, currency (`denominacion`), rate type and province.
- `Prestamos/Hipotecarios`: one row per product, with the same rate, term, beneficiary, currency and province fields as personal loans, plus the purpose (`destinoFondos`) and the largest share of the appraisal financed (`relacionMontoTasacion`). It has no minimum amount. On a UVA product the TEA and CFT are on top of the UVA adjustment of the capital: they run from about 3.5 % to 23 %, against 16 % and up on peso mortgages, and lenders describe them that way in `masInformacion` ("CAPITAL AJUSTADO POR UVA Y TASA DE INTERES…").
- `TarjetasCredito`: one row per card, with the maximum effective annual rates for financing and for cash advances, the monthly maintenance and yearly renewal fees at list price, the segment and province.

All three answer the whole list in one response, without pagination. Every row carries `fechaInformacion`, the date the lender last reported it, which differs widely between lenders. The BCRA limits traffic per client IP address and publishes no figures.

The plazo fijo endpoint is not used: its `denominacion` is empty on every row, so peso and dollar deposits cannot be told apart.

## Why the data is built ahead of time

The personal-loan response is about 1.7 MB of JSON, too much to parse and validate within a Worker invocation's CPU time, cron runs included. `scripts/build-transparency-rates.py` therefore does it outside the Worker and writes `app/lib/transparency-rates.generated.json`, which only `transparency-rates.server.ts` imports. The smaller mortgage response (about 250 KB) goes through the same build. A request filters that file in well under a millisecond and calls no upstream, so the page has no loading state and no `/api-status` row.

## Rules

The script validates every row (types, dates, known beneficiaries, segments and provinces) and keeps a row only when:

- it was reported no more than 12 calendar months before the build;
- its rates are above zero and at most 10,000 % (`MAX_RATE`): for a loan both the TEA and the CFT, for a card the financing TEA. Short-term credit from non-bank lenders is priced up to about 5,000 % CFT and is kept; the cap only drops values that cannot be a yearly rate. A card's cash-advance rate outside that range reads as not informed;
- for a loan, `denominacion` is Pesos (the BCRA spells "Dólares" with and without the accent; both are left out) and the product name does not say UVA or UVI: some UVA-adjusted loans are reported as Pesos, and their rate is on top of the UVA's;
- for a mortgage, `denominacion` is UVA (peso and dollar mortgages are left out) and `destinoFondos` buys a home: "Vivienda propia, única y permanente" or "Vivienda adicional o 2da vivienda" (`DESTINATIONS`). Construction, refurbishment, land and the other purposes are left out. A financed share at or below zero or above 100 % reads as not informed; the amounts and the first instalment (`cuotaInicial`) are not kept, since lenders fill them with placeholders and different bases.

The page shows only the products kept, without counting the rest; the script prints the counts per reason when it runs. Card fees of `999999` or `999999.99` are placeholders and read as not informed. Rows that differ only in province are merged into one row listing them; a nationwide row covers every province. The script refuses to write a build with fewer than 200 loans, 50 mortgages or 50 cards, so a broken response never replaces the committed file.

**Provinces.** Cards name the province (`"Provincia del Neuquén"`, `"Todo el territorio nacional"`). Loans and mortgages send an undocumented code: `0` is the whole country and `1` to `24` follow the alphabetical list of jurisdictions with "Ch" after "C" (`1` Ciudad Autónoma de Buenos Aires, `2` Buenos Aires, `6` Chaco, `24` Tucumán; `PROVINCES` in the script). The order was inferred, not published: the lenders that report both products give the same provinces in both for 24 of 29 lenders, and overlapping ones for the rest.

## The comparison

Rates in the Régimen de Transparencia are ceilings: the rate a lender offers can be lower depending on the applicant. Products are also segmented by beneficiary, term, amount and province, so the page compares only the products that match the visitor's filters and never ranks across segments that do not apply.

- **One row per lender**: its cheapest matching product (loans and mortgages by CFT, ties to the lower TEA; cards by financing TEA, ties to the lower maintenance fee), with the number of its matching products. Lenders are ordered by that figure, 20 per page (`?pagina=`). A loan CFT below 10 % (`UNUSUALLY_LOW_CFT`) is far under any peso lending rate; the row stays, with the note "Valor inusualmente bajo" under the figure.
- **Loan filters**: `perfil` (beneficiary; a product open to everyone matches every profile), `plazo` (6 to 60 months; a product matches when its maximum term reaches it), `monto` (whole pesos, dots allowed; within the product's range) and `provincia`.
- **Mortgage filters**: `perfil` (as for loans), `destino` (`vivienda-unica` or `segunda-vivienda`), `plazo` (10 to 30 years, written in months: 120 to 360; a product matches when its maximum term reaches it) and `provincia`. Products limited to clients who are paid through the lender are shown like any other; a note under the table points to the profile filter. There is no low-CFT note: UVA rates are low by nature.
- **Card filters**: `segmento` (Nacional, Internacional, Gold, Platinum, and Signature, Black or similar, which the endpoint reports as one value) and `provincia`.
- **URL**: the loader redirects any query to its canonical form, panel first and each set filter in a fixed order, removing unknown or invalid values, the other panel's parameters and page 1; a page past the last becomes the last. A bare `/tasas` shows the loans panel without a redirect. The filters are a GET form, so the page works without JavaScript; selects submit on change.
- **Crawlers**: every filter and page is its own URL and a full server render, so `robots.txt` disallows `/tasas` with any panel parameter but `panel` (built from `LOAN_PARAMS`, `MORTGAGE_PARAMS` and `CARD_PARAMS` in `app/routes/robots.ts`); crawlers keep to the three panels, and the page's canonical is the bare `/tasas`.

## Refreshing (weekly)

The `Refresh rates` workflow (`.github/workflows/refresh-rates.yml`) runs the script every Monday and on demand from the Actions tab. It commits to the branch as `github-actions[bot]` only if `pnpm test` and a Wrangler dry run pass; the push deploys through Workers Builds. The build date shown on the page ("Consultado el …") changes on every run, so a successful run always commits. A failure, such as the BCRA refusing the runner or a response below the minimums, fails the run and sends an email; then run the script by hand.

```sh
python3 -I scripts/build-transparency-rates.py
```

If the BCRA refuses the machine running the script, save the three responses another way (from a browser, for instance) into one folder, named `PrestamosPersonales.json` (from `Prestamos/Personales`), `PrestamosHipotecarios.json` (from `Prestamos/Hipotecarios`) and `TarjetasCredito.json`, and pass the folder with `--input-dir`; the script then reads them instead of calling the API. Save them the same day: the page shows the day the script runs as the consultation date.

```sh
python3 -I scripts/build-transparency-rates.py --input-dir ~/transparencia
```

Commit `app/lib/transparency-rates.generated.json` and run `pnpm test`. Weekly is enough: lenders update their rows every few weeks or months, a few dozen rows a day across all of them, and every row shows its own date.

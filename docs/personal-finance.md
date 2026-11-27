# Mi economía

`/mi-economia` is a personal salary and budget tracker. Its four tabs are selected with `?tab=` and the month with `?month=YYYY-MM`:

| Tab | `?tab=` | Contents |
| --- | --- | --- |
| *Usuario* | `usuario` | Sign-in, account state, and JSON export, import and deletion of the records. |
| *Presupuesto* | `presupuesto` | Budget categories, their monthly allocations, recorded expenses, and copying an earlier month's salary and allocations into the selected one. |
| *Planificación* | `planificacion` | Upcoming one-time and monthly expenses, and savings goals with manually recorded progress. |
| *Precios* | `precios` | Dated list prices of everyday products at nearby supermarkets, as a reference only: they never change a planned amount. See [product-price-feed.md](product-price-feed.md). |

The month's net salary is saved from the sticky month bar above the tabs. Access rules, storage and setup are in [cloud-finance-setup.md](cloud-finance-setup.md).

The page is `noindex`, and since the month bar links each month to the one before and after it, its query variants have no end. `robots.txt` disallows `/mi-economia?` (any month or tab) and keeps the bare path open, so crawlers still read the `noindex`.

## Data

Each account's records are one JSON document in a `finance_documents` row. `localFinanceSchema` in `app/lib/local-finance.ts` validates it on load, import and save. It holds monthly net salaries, budget categories, per-month allocations, recorded expenses, planned expenses with their paid or skipped resolutions, and savings goals. Amounts are integer centavos. Each form intent (such as `expense.add` or `plan.pay`) is a case of `applyFinanceCommand`, and `buildLocalFinanceMonth` derives what the tabs show for a month.

## Upcoming expenses

Upcoming expenses belong to a category plan. Pending bills show as commitments in their category; recording a payment creates an actual expense and removes the commitment. A planned amount is either confirmed or explicitly marked as an estimate.

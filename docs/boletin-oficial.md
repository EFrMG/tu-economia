# Boletín Oficial digest

Automatic summaries of the household-relevant notices in the first section of the Boletín Oficial de la República Argentina (BORA), shown on `/noticias?panel=boletin` and, capped at three, on Resumen (`/dashboard`). The cron prepares them once per notice and stores them in D1; pages only read D1, and nothing is generated per request.

The whole feature sits behind `BOLETIN_DIGEST_ENABLED`, in `wrangler.jsonc`: while it is not `"true"` the cron does nothing, `/noticias` has no Boletín panel and Resumen has no Boletín card. The home page, `/docs`, `/privacy` and `/terms` describe the digest regardless of the flag; the `/noticias` and Resumen meta descriptions and the sidebar label follow it.

## Code

| File | Role |
| --- | --- |
| `app/lib/boletin-source.server.ts` | Parses the section page and the notice pages, selects notices, trims the text and detects personal data. |
| `app/lib/boletin-summary.server.ts` | The prompt, the Workers AI call, validation of the answer and the figure and personal-data checks. |
| `app/lib/boletin.server.ts` | The cron run, the D1 queue, the retention prune and the read for loaders. |
| `app/lib/boletin.ts` | Client-safe types, the flag, the `/noticias` panels and presentation helpers. |
| `app/lib/scheduled-tasks.ts` | Which job a run of the shared cron trigger does. |
| `app/components/features/BoletinDigest.tsx` | The panel and the Resumen card. |
| `migrations/0009_boletin_digest.sql` | `boletin_editions` and `boletin_notices`. |

## Source

There is no API or feed. `https://www.boletinoficial.gob.ar/seccion/primera` is server-rendered HTML: rubro headings (`h5.seccion-rubro`: Decretos, Resoluciones, Resoluciones Conjuntas, Resoluciones Sintetizadas, Disposiciones, Avisos Oficiales, Convenciones Colectivas de Trabajo, Avisos Oficiales - Anterior) followed by one link per notice, `/detalleAviso/primera/<id>/<YYYYMMDD>`, whose `p.item` line is the issuing agency (for decrees, the subject) and whose `p.item-detalle` lines are the norm's number and official reference. A paperclip link with `?anexos=1` next to a notice marks that it has annexes. The notice page holds the text in `div#cuerpoDetalleAviso`. The edition of 2026-11-19 listed 67 notices, 22 with annexes.

`robots.txt` disallows only the second section (`/seccion/segunda`, `/detalleAviso/segunda/*`), which the digest never reads. Requests identify the app (`TuEconomia/1.0 (+<site>)`).

### Reuse terms

Checked on 2026-11-19: the site has no terms of use, legal notice or licence page. Its "Institucional", "Productos y servicios" and "Preguntas frecuentes" pages say the digital edition is the official and authentic one, with the same legal effect as the former printed edition (Decreto 207/2016), and that the website is accessed "en forma libre y gratuita".

So linking to notices and showing their official reference are not restricted by anything published, and nothing published grants or denies permission for third-party summaries. If the Dirección Nacional del Registro Oficial (atencionalcliente@boletinoficial.gob.ar) ever publishes terms or objects, the flag turns the feature off.

## Pipeline

One cron trigger serves every scheduled job: `*/5 6-15 * * *` in `wrangler.jsonc`, every five minutes from 06:00 to 15:55 UTC (03:00 to 12:55 in Argentina). The 06:00 run is the daily maintenance (lapsed Mi economía records, and Boletín editions older than 21 days); the runs from 06:05 to 08:25 refresh the saved copies of the market data ([market-data.md](market-data.md#saved-copies)) and give the digest only the runs they do not need; every later run is a digest run. A manual run with the former daily expression, `0 6 * * *`, forces the maintenance.

Each run does one of two things:

1. **Summarize.** Take the `N` oldest `pending` notices (`NOTICES_PER_RUN`) and, one after another, read each page, apply the exclusions, trim the text, call the model, check the answer and store the result. The run stops at the first notice that will be retried (a failed page or model call before its last attempt), so a spent daily allocation or a network spell costs one attempt per run rather than one for every notice in it. Fewer pending notices make a shorter run; the next run collects.
2. **Collect.** With nothing pending and no edition stored for today's date in Argentina, read the section page. When the newest edition it lists is newer than every stored one, record it and insert its selected notices as `pending`; otherwise (before the morning edition, and on days without one) nothing is recorded. The edition need not be today's, so one missed on its own day (published after the last run, or while the cron or the site was down) is collected the next day if the page still shows it, and the first run on an empty database collects whatever the page shows. An edition the page has already replaced is lost.

Pending notices come first so that a day without an edition, which reads the page on every run, still finishes the previous one. Collecting is always a run of its own.

A notice costs about 4 s of wall time (the model call), which does not count as CPU, and three subrequests: its page, the model and the D1 write. A run with one notice measured 1 to 3 ms of CPU. A summarizing run makes 10 subrequests with the pending query, and 17 when it follows a refresh run that found nothing to refresh (that run's D1 reads of the saved copies); a collect run makes 4.

A notice ends as:

| Status | Meaning | Shown |
| --- | --- | --- |
| `summarized` | Summary generated and passed the checks. | Title, summary, up to three points. |
| `title_only` | The model failed three runs (quota, network), its answer was not valid JSON, or the summary failed a check. | The official reference and the link. |
| `excluded` | Personal data, an edict or an act about a person. | Never. |

`outcome` records why (`ok`, `invented-figures`, `personal-data`, `invalid-output`, `model-failed`, `fetch-failed`, `individual-act`, `edict`, ...), and `neurons` what the call costs, from the response's `usage.neurons`.

Each step writes one JSON line to Workers Logs as it ends (`{"job":"boletin","step":…}`): a collect run writes one, a summarizing run one per notice, so up to three `processed` lines, or `processed` lines followed by the `retry` that stopped it. Workers Logs is also where the CPU time per invocation shows.

The site sometimes switches the section page to a contingency mode (first seen on 2026-11-23): the edition as a base64 PDF of several MB in an `iframeContingencia`, with no notice links, while the notice pages keep working. A collect step recognizes it from the page's first 64 KB, stops the download, records nothing and logs `"step":"contingency"`; the listing is read again on the next run. Any other page over 2 MB still fails the step.

The page opens on the latest edition with at least one notice past `pending`, so the previous edition stays until the first summary of the new one is ready.

An edition bar under the intro steps through the kept editions; the edition is in the URL, `?panel=boletin&edicion=YYYY-MM-DD`; an unknown or deleted date opens the latest.

Each edition lists household-affecting summaries first, then the listing order, and says how many notices are still in preparation. Resumen always shows the latest edition.

## Selection

At collection (`isRelevantListing`), from the listing alone:

- every decree, whatever its subject;
- in Resoluciones (also Generales, Conjuntas, Sintetizadas), Disposiciones and Avisos Oficiales, notices from ARCA, Ministerio de Economía and its secretariats, Energía, the electricity and gas regulators (ENRE, ENARGAS, the merged ENREGE), the BCRA, Capital Humano, ANSES and Comercio;
- never customs offices or ARCA regional directorates (edicts citing people), Capital Humano's labour directorate (collective agreements), Convenciones Colectivas or "Avisos Oficiales - Anterior" (repeats of earlier days).

On the notice text (`exclusionReason`), before any model call:

- a DNI number next to its label, or a CUIT/CUIL with a natural person's prefix (20, 23, 24, 27; companies use 30, 33, 34) anywhere in the body;
- an edict ("EDICTO", "cítase", "emplázase");
- a first article about a person: appointments, resignations, appeals, disciplinary proceedings, a "llamado de atención", individual benefits.

On 2026-11-19 this kept 15 of 67 notices, excluded 8 of them (administrative decrees, each with a DNI) and summarized 7. The notice text itself is never stored, and editions are deleted after 21 days, about fifteen editions and some 30 KB of summaries (the latest is always kept, so a long gap without editions still leaves one on screen).

## Summaries

`@cf/openai/gpt-oss-120b`, Chat Completions form, `reasoning_effort: "low"`, a JSON schema (`titulo`, `resumen`, `puntos`, `afecta_hogares`), temperature 0.2, 1,500 output tokens at most. The input is the norm's reference plus its operative part: the articles after RESUELVE:/DECRETA:/DISPONE:…, without the preamble, the closing article, signatures and the publication stamp, capped at 16,000 characters (about 5k tokens). A longer text is cut before the article that would cross the cap, the model is told it is partial, and the card says the summary covers the first articles. A notice with annexes is flagged to the model, which is told to point to them rather than invent their figures.

The prompt asks for formal, calm Spanish, only figures that appear in the text, dates with the month in words, acronyms explained, no personal data, and whether the norm affects households. The answer is rejected (and the notice kept as `title_only`) when:

- it is not valid JSON matching the schema, within generous length limits;
- any figure in it is not in the source or the norm's reference. "USD 4.800 millones" counts as present when 4.800.000.000 is. This catches invented numbers, not real numbers put in the wrong place, which is why model quality still matters;
- it contains a DNI or a person's CUIT.

`afecta_hogares` only decides the order of the Resumen card (`getResumenBoletin`); the panel shows every notice. The card shows up to three summaries: those affecting households first, from any kept edition and newest first, then the latest edition's other summaries in listing order. Cards carry no date, so an earlier edition's household notice can sit beside today's. The card is empty, with a link to the panel, only when no kept edition has a household summary and the latest has no summary at all. The panel's intro says the summaries are automatic and the official text prevails, and Resumen's sources footer names them as automatic; each card links to the notice and only notes what sets it apart ("Sin resumen automático", "Resumen de los primeros artículos").

### Model choice

Compared on 2026-11-19 on six notices of that day's edition, same prompt (Neurons per notice from the API's own count):

| Model | Passed checks | Output tokens | Neurons | Time | Notes |
| --- | --- | --- | --- | --- | --- |
| `gpt-oss-120b` | 6/6 | 214 | 49 | 4 s | No factual errors found. |
| `gpt-oss-20b` | 6/6 | 168 | 24 | 5 s | Two factual errors the checks cannot catch (a committee "created" instead of modified; an exchange-rate date taken from a transfer deadline). |
| `mistral-small-3.1-24b` | 6/6 | 160 | 44 | 5 s | Accurate but terse and sometimes vague. |
| `gemma-4-26b-a4b-it` | 3/6 | 1,372 | 47 | 28 s | Long reasoning exhausts the token limit before the JSON ends. |


## Cost and limits

At about 50 Neurons per notice, a typical day (7 to 15 summaries) uses 350 to 750 Neurons, and even 30 stays under 1,500. Local development and tests that reach the binding spend the same allocation.

## Enabling and operating

1. Deploy with `BOLETIN_DIGEST_ENABLED` set to `"true"` in `wrangler.jsonc` (setting it to anything else turns the cron and the pages off). The next morning's runs collect the edition; the panel fills as notices are summarized.
2. Check: Workers Logs show `collected`, then `processed` lines; `wrangler d1 execute tu-economia --remote --command "SELECT status, outcome, COUNT(*), SUM(neurons) FROM boletin_notices GROUP BY 1, 2"` shows how notices ended and what they cost.

To run a step locally, start `CLOUDFLARE_REMOTE_BINDINGS=true pnpm dev` with the flag set in `.dev.vars` (`BOLETIN_DIGEST_ENABLED=true`) and fire the scheduled handler with the shared expression; each call is one run, and summarizing reaches the remote Workers AI with your Wrangler login.

```sh
curl -X POST "http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=tu-economia" -H "Content-Type: application/json" -d '{"cron": "*/5 6-15 * * *"}'
```

The tests (`app/lib/boletin*.test.ts`) cover parsing against the live markup, selection, exclusions, trimming, the checks and the queue against SQLite with the real migration; none reaches the network or the model.

## Later

Not in scope: the provincial and CABA bulletins (local tariffs and taxes), the second section (company registry, disallowed by `robots.txt` and full of personal data), the third section (procurement), annex PDFs, and the Infoleg dataset for history and search.

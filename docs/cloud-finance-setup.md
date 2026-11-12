# Accounts and cloud finance setup

*Mi economía* stores each signed-in account's records in Cloudflare D1. Accounts, cloud storage and billing each have a flag in the table below, set to the literal `"true"`. While one is off, its routes stay disabled and nothing is written to D1.

## Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `AUTH_ACCOUNTS_ENABLED` | variable | `true` turns on sign-in and `/api/auth/*`. Also needs the `DB` binding, `AUTH_BASE_URL`, `AUTH_SECRET` and at least one sign-in method; until then the route answers 503. |
| `FINANCE_STORAGE_ENABLED` | variable | `true` allows reading and writing finance records and runs the daily retention job. |
| `BILLING_ENABLED` | variable | `true` allows new Mercado Pago checkouts, and needs `FINANCE_STORAGE_ENABLED`. See [billing.md](billing.md). |
| `AUTH_BASE_URL` | variable | The site origin with no path, for example `https://example.com`. HTTPS is required except for `http://localhost`. Used for Better Auth, same-origin checks and the links in emails. |
| `AUTH_SECRET` | secret | At least 32 characters; `openssl rand -hex 32` produces one. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | Enable Google sign-in; both are required. |
| `RESEND_API_KEY` | secret | Enables email sign-in links and retention notices. Required together with `EMAIL_FROM`. |
| `EMAIL_FROM` | variable | Sender on a domain verified with Resend, for example `"Tu Economía <acceso@example.com>"`. Not a secret. |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | secrets | Mercado Pago credentials for [billing](billing.md). |
| `INDEC_API_TOKEN` | secret | Catálogo API-INDEC token for the canasta, wages and IPC tables on `/precios` and two Resumen figures ([market-data.md](market-data.md#indec-canastas-salarios-ipc)). Generated under "Gestionar la cuenta" at `https://api.indec.gob.ar/` and shown once. It expires 12 months after it is generated; regenerating revokes the old one, so set the new one right away. Without it, those three tables show as unavailable. |

Variables go in `vars` in `wrangler.jsonc`, and a deploy replaces variables set in the dashboard with them. Secrets are set with `wrangler secret put <NAME>` and, locally, in the gitignored `.dev.vars`; never put them in tracked files.

## Database

The Worker reads and writes D1 through the `DB` binding in `wrangler.jsonc`. `pnpm dev` runs against Miniflare's simulated D1 in `.wrangler/state`, never the remote database. It starts empty and needs the migrations before *Mi economía* can store anything. Applied migrations are tracked in `d1_migrations`, so the command skips them (do not also run them with `d1 execute --file`):

```sh
mise exec -- pnpm exec wrangler d1 migrations apply tu-economia --local
mise exec -- pnpm exec wrangler d1 migrations apply tu-economia --remote
mise exec -- pnpm exec wrangler d1 migrations list tu-economia --remote
```

`--local` and `--remote` are different databases; check the flag on every command. Deleting `.wrangler/state` resets the local one. See Cloudflare's [D1 Wrangler command reference](https://developers.cloudflare.com/d1/wrangler-commands/).

The auth tables were generated from the installed Better Auth version. When updating Better Auth, regenerate its schema and add a new migration for any difference instead of editing an applied one.

## Local development

A minimal `.dev.vars` for signing in locally:

```sh
AUTH_ACCOUNTS_ENABLED=true
FINANCE_STORAGE_ENABLED=true
AUTH_BASE_URL=http://localhost:5173
AUTH_SECRET=<at least 32 characters>
# plus a sign-in method: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or RESEND_API_KEY and EMAIL_FROM
```

Before a sending domain is verified, Resend delivers through its `onboarding@resend.dev` sandbox sender, and only to the Resend account owner's address, which is enough to check emails.

Editing needs a current entitlement. Without a Mercado Pago test setup, grant one in the local database:

```sql
INSERT INTO billing_subscriptions (user_id, subscription_id, provider_status, trial_ends_at, created_at, updated_at)
VALUES ('<user id>', 'dev-<user id>', 'authorized', '2099-01-01T00:00:00.000Z', datetime('now'), datetime('now'));
```

Find the user ID with `SELECT id, email FROM "user"`. Run SQL with `mise exec -- pnpm exec wrangler d1 execute tu-economia --local --command "<statement>"`, one statement per call.

## Sign-in

Better Auth stores opaque sessions in D1 and checks the database on each request, so signing out revokes a session immediately. Sessions expire after seven days and slide at most once per day. Magic links expire after five minutes, are stored hashed and are consumed once. Accounts with matching email addresses are never linked automatically; linking Google to an existing account requires a signed-in session.

- **Google**: register `<AUTH_BASE_URL>/api/auth/callback/google` as an authorized redirect URI on the OAuth client. Use separate development and production clients.
- **Email links**: `app/lib/email.server.ts` posts every message to Resend's API and resolves only after Resend accepts it. The Spanish wording is in `app/lib/email-templates.ts`. URLs and their tokens are never logged.

The Usuario tab offers only the methods whose configuration is complete.

## Cloud storage and access

Each account's records are one validated JSON document in `finance_documents` (`localFinanceSchema` in `app/lib/local-finance.ts`), read and written by the `/mi-economia` loader and action in `app/lib/finance-store.server.ts`.

What a visitor can do:

- **Signed out**: browse the tabs with the starter categories and every control disabled.
- **Signed in with a current trial or paid period**: edit.
- **Signed in without one**: read, download `GET /api/finance-export`, and delete the records by typing `BORRAR`.

Storage requires a Better Auth session, the `DB` binding and `FINANCE_STORAGE_ENABLED=true`, and form posts must be same-origin. Each edit is applied to the latest stored revision with an atomic revision check, retried up to three times when another session saved first. Starter categories carry stable `starter-n` IDs, so a page rendered before the first save matches what that save creates. Imports accept an exported JSON file (document `version` 1) of up to 512 KiB.

## Retention of lapsed records

Records of an account without a current trial or paid period are deleted no sooner than three calendar months after access ends (`app/lib/finance-retention.ts`). The deadline anchors to the **later** of the entitlement end and the record's last write. A lapsed account cannot edit, so the last write is normally the last save made while access was active; the rule also covers legacy rows. A record with no entitlement on file is measured from its last write.

A daily cron trigger (`0 6 * * *` in `wrangler.jsonc`) runs `runFinanceRetention` from `workers/app.ts`, and does nothing unless `FINANCE_STORAGE_ENABLED=true`:

- Two calendar months after access ends it attempts a notice through Resend (`app/lib/finance-retention.server.ts`). The notice states the deletion date and links to the Usuario tab for export or reactivation. It needs `AUTH_BASE_URL` for that link.
- The first attempt is recorded even when Resend rejects the message, so an address that cannot receive mail does not keep lapsed records forever. Deletion happens no sooner than thirty days after that attempt and no sooner than the three-month deadline; a failed delivery is retried daily until then.
- Missing sending configuration does not count as an attempt, so a deployment without `RESEND_API_KEY` or `EMAIL_FROM` never starts the clock or deletes silently.
- A resumed entitlement clears both the attempt and the delivered notice. Deletion re-checks the entitlement and the record's last write immediately before removing it.
- The loader shows the scheduled date to read-only accounts.

## Account deletion

`DELETE /api/account` requires a same-origin request, a current session, a matching `expectedUserId` and the confirmation `ELIMINAR`. It first cancels an active Mercado Pago subscription (see [billing.md](billing.md)), then deletes in one D1 batch the Better Auth user with its sessions and linked accounts, the cloud finance document and any pending sign-in links for that email. Billing records are kept. *Mi economía* offers a JSON export before deletion.

## Testing the email and retention flow locally

This flow exercises the sign-in link and the retention notice against Resend from local state. It needs the `.dev.vars` example above including `RESEND_API_KEY` and `EMAIL_FROM`, and the entitlement grant from [Local development](#local-development). The retention logic is also unit-tested in `app/lib/finance-retention.test.ts` and `app/lib/finance-store.server.test.ts`.

1. Start the dev server (`pnpm dev` serves port 5173) and sign in through the email form in the Usuario tab. Open the received link: it must land signed in on `/mi-economia?tab=usuario`. A link requested through the app form carries `callbackURL`; Better Auth's default without one is the site root, which is where hand-made `curl` requests land.
2. Save anything once through the enabled controls so `finance_documents` holds a row.
3. Move the rows into the notice window. The notice goes out thirty days before the three-month deadline, so the later of the two dates must be at least about two months old; four months leaves margin:

   ```sql
   UPDATE billing_subscriptions SET trial_ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 months') WHERE user_id = '<user id>';
   UPDATE finance_documents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 months') WHERE user_id = '<user id>';
   ```

4. Fire the scheduled handler through Wrangler's Local Explorer API, against whichever local server is running (the old `/__scheduled` route does not exist in Wrangler 4):

   ```sh
   curl -X POST "http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=tu-economia" -H "Content-Type: application/json" -d '{"cron": "0 6 * * *"}'
   ```

   The notice email reaches the inbox, stating the deletion date and linking to the Usuario tab.
5. Confirm the send: `deletion_notice_attempted_at` and `deletion_notice_sent_at` in `finance_documents` hold the run timestamp and the signed-in tab shows the scheduled date. Read them back with `mise exec -- pnpm exec wrangler d1 execute tu-economia --local --command "SELECT deletion_notice_attempted_at, deletion_notice_sent_at FROM finance_documents"`, or through the same explorer API (`POST /cdn-cgi/local/explorer/api/d1/database/<database id>/raw` with `{"sql": "…"}`).

To force the other branches, invoke the scheduled request again after each statement:

- **Deletion**: make the thirty days since the notice attempt pass while the entitlement stays lapsed: `UPDATE finance_documents SET deletion_notice_attempted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 days') WHERE user_id = '<user id>';`. The next run deletes the row, and the tab falls back to the starter document.
- **Reset**: restore the entitlement while a notice is on file: `UPDATE billing_subscriptions SET trial_ends_at = '2099-01-01T00:00:00.000Z' WHERE user_id = '<user id>';`. The next run clears both notice columns and the deletion warning leaves the tab.

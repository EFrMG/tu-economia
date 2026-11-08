# Billing

Editing *Mi economía* in the cloud is paid: the first subscription includes one calendar month at no charge, then a monthly fee (`MONTHLY_PRICE_ARS` in `app/lib/billing-entitlement.ts`) through Mercado Pago subscriptions. Billing is off by default (`BILLING_ENABLED`).

## Product terms

The public text is at `/terms`, linked from the footer, the sitemap and the checkout acceptance line.

- Mercado Pago's hosted checkout collects the payment details and the recurring-charge authorization; card data never enters this app.
- A subscriber may cancel at any time. Cancellation stops the next charge, and access continues until the end of the current trial or paid period.
- After a cancellation or a lapse the subscriber can subscribe again. The free calendar month belongs to the account's first plan; a replacement plan has no `free_trial` and starts charging at authorization.
- A failed renewal grants no grace period: editing stops when the last paid period ends. A refund removes the access that payment granted; refunds are issued on request; see [Refunds](#refunds).
- Without a current period an account keeps read access, JSON export and record deletion, and its records are deleted after the retention period. See [cloud-finance-setup.md](cloud-finance-setup.md#retention-of-lapsed-records).

## How it works

Code: `app/lib/billing.server.ts` (handlers and reconciliation), `app/lib/mercado-pago.server.ts` (the provider client), `app/lib/billing-entitlement.ts` (who may edit) and the routes `billing-api.ts` and `billing-webhook-api.ts`. Billing is stored apart from the finance documents: `billing_subscriptions` holds one row per user for the current subscription (plan and subscription IDs, provider status, trial and paid end times), and `billing_payments` the verified payments. A later checkout replaces the row's plan and subscription IDs; earlier payments stay.

`BILLING_ENABLED` only controls new checkouts; an existing subscriber can still cancel when it is off. `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET` are Worker secrets; see [cloud-finance-setup.md](cloud-finance-setup.md).

## Provider setup

1. Create an application in the Mercado Pago developer dashboard and copy its access token into `MP_ACCESS_TOKEN`. Use it for this app only: the webhook cancels any subscription whose plan no account owns.
2. Register the notification URL `https://<AUTH_BASE_URL>/api/billing/webhook` and subscribe it to the `subscription_preapproval` and `subscription_authorized_payment` topics. Copy the integration's signing secret into `MP_WEBHOOK_SECRET`. The endpoint answers `503` while either credential is missing; a notification sent meanwhile is lost and recovered by `GET /api/billing`.
3. Keep `AUTH_BASE_URL` equal to the public origin: the checkout `back_url`, the same-origin checks and the webhook URL derive from it. A workers.dev origin and a custom domain are different origins.
4. Before setting `BILLING_ENABLED=true`, run the whole lifecycle with Mercado Pago's [test seller and buyer accounts](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/test/accounts), [test cards](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/test/cards) and [test purchase flow](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-test/payment-approval): enrollment, trial expiry, first and later charges, failed payments, refunds, cancellation during a trial and a paid period, re-subscription, duplicate or delayed webhooks, and account deletion.

Access never comes from a browser return URL or a notification payload alone: every change starts from a signed-in session or a fresh `GET` to Mercado Pago. A subscription belongs to the account that owns its unique plan ID, not to the address Mercado Pago charges.

### Endpoints

`/api/billing` needs a signed-in session. `POST` and `DELETE` also need a same-origin request and a body of at most 1,024 characters.

- **`POST` (checkout)** requires `acceptedTerms` and the matching `expectedUserId`. It creates a plan unique to the user (monthly, with a one-month `free_trial` on the account's first plan only) and returns the plan's hosted checkout URL, which must be `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=<plan>`. While the plan has no subscription, a repeated `POST` and the `GET` status return the same stored link, so an abandoned or failed checkout can be resumed without a second plan; once a subscription exists the link is cleared. While access is still in force, while an authorized replacement awaits its first verified payment, or while a checkout is `creating` or otherwise unreconciled, another checkout answers `409`. A `pending` subscription whose provider ID is known is cancelled and replaced like any other ended one, so an abandoned checkout does not trap the account. Once access has ended, `POST` starts a replacement with a new plan that omits `free_trial`: a subscription the provider still shows as active is cancelled first, and the record is reserved for the new plan. The old plan is never reused, because a second subscription on it would make the plan-filtered search ambiguous. The reservation is written before the plan request, so a lost provider response leaves the record `creating` and blocks a retry.
- **`GET` (status)** returns whether the account is entitled, the provider status, the trial and paid end dates, and `checkoutURL` for a checkout that can be resumed. It reconciles by searching for a subscription on the user's plan ID and verifying the canonical provider record, which recovers a lost subscription notification. A checkout whose card is rejected leaves a cancelled subscription on the same plan, so when the search returns several, cancelled ones are set aside and the one that can still charge is used. When access has expired it also searches the subscription's authorized payments, reading the first result page only.
- **`DELETE` (cancel)** cancels at Mercado Pago and keeps access through the stored period. A known subscription can be cancelled even if the plan search fails; the response then carries `reconciliationRequired`.
- **`POST /api/billing/webhook`** checks the `x-signature` HMAC-SHA-256 (five-minute timestamp tolerance), then handles the `subscription_preapproval` and `subscription_authorized_payment` topics by fetching the resource from Mercado Pago. The notification is only a hint. Mercado Pago sends a new subscription and its first payments at the same moment, so a payment whose subscription is not linked yet fetches that subscription and links it to the plan's owner before it is stored. A payment can also be notified before Mercado Pago serves it (`404`); the `502` answer makes Mercado Pago retry. Notifications are signed with the application's own secret, so a second application pointed at the same URL is answered `401`.

An unexpected failure answers `502` and is logged to Workers Logs. When a Mercado Pago response fails validation, the log lists only each issue's field path, code and message, never the payload.

Account deletion cancels an active subscription first; see [cloud-finance-setup.md](cloud-finance-setup.md#account-deletion).

### Entitlement

- **Trial**: starts when a verified subscription is `authorized`, its plan includes a one-month `free_trial`, and its plan terms are as expected. It ends one calendar month after the subscription's creation timestamp, clamped to the month's last day. A replacement plan omits `free_trial`, so it never grants a trial; its access starts with the first approved payment.
- **Paid period**: each approved authorized payment of the monthly amount extends access to one calendar month after its debit date. Repeated events for a payment update one row. A refunded, reversed or charged-back payment no longer counts, and a delayed approval cannot restore it.
- **Access** lasts until the later of the trial end and the paid-through date. Cancelling keeps the stored dates, and a verified payment keeps its paid period even if a later renewal fails.
- **Late or missing notifications**: payments are found through the current subscription ID, so a notification for a replaced subscription is ignored and its `billing_payments` row keeps the last verified status.

### Re-subscribing from Mercado Pago

A buyer can re-subscribe to a cancelled subscription from their own Mercado Pago account, without visiting the app. Mercado Pago then creates a new subscription on the same plan; it does not reactivate the old one.

- **On the account's current plan**, the new `authorized` subscription replaces the cancelled one in the record. The stored dates stay until its first payment is verified; the plan has no `free_trial` if it is a replacement, so that payment is taken at authorization.
- **On a plan a later checkout replaced**, no account owns the plan, so the subscription can never grant access. The webhook cancels it at Mercado Pago and logs it. A charge already taken, such as the first month of a plan without a free trial, needs a [refund](#refunds).

### Refunds

Refunds are issued by hand from the seller's Mercado Pago panel, on request. A refund neither cancels the subscription nor sends a subscription notification, so it changes nothing here by itself:

1. Refund the payment in Mercado Pago. If renewal should also stop, cancel the subscription there too, or ask the subscriber to cancel it in the app; the cancellation arrives as a notification.
2. In D1, mark the payment and take back the period it paid for. `paid_until` becomes one calendar month after the latest payment still `approved` for that subscription, or `NULL` if none remains, which is the case below:

   ```sql
   UPDATE billing_payments SET status = 'refunded' WHERE provider_payment_id = '<authorized payment id>';
   UPDATE billing_subscriptions SET paid_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE subscription_id = '<subscription id>';
   ```

A later notification for that payment cannot turn a `refunded` row back into `approved`.

[Subscription management](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management) documents cancelling renewal by setting the subscription status to `canceled`, but the API rejects that value and takes `cancelled`; the client sends `cancelled` and normalizes either spelling it reads back to `canceled`. Cancellation is final at the provider, which is why the app stores its own access end dates instead of relying on the provider status.

### When it stops instead of guessing

These cases answer `409` and need manual reconciliation, because continuing could leave a charge possible or create a duplicate:

- A plan creation whose response was lost blocks another checkout, re-subscription and account deletion. A checkout with no provider subscription can be resumed through its stored link but still blocks account deletion.
- A cancelled subscription that Mercado Pago reports as `authorized` again. Cancellation is final there, so this is a stale read, which the notification's retry corrects, or an undocumented reactivation that could charge without granting access.
- A plan search with incomplete results or more than one subscription that can still charge (a `pending` one counts, since its checkout can still be completed), or a payment search that returns more than one page. The Worker logs the result count or the statuses involved, never the payload.

Billing rows are kept after account deletion (marked `account_deleted_at`).

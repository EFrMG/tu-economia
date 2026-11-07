-- Billing metadata is separate from finance documents. Retain it after account
-- deletion until the operator sets a financial-record retention policy.
CREATE TABLE billing_subscriptions (
  user_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT UNIQUE,
  checkout_url TEXT,
  subscription_id TEXT UNIQUE,
  provider_status TEXT NOT NULL DEFAULT 'pending',
  trial_ends_at TEXT,
  paid_until TEXT,
  canceled_at TEXT,
  account_deleted_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE billing_payments (
  provider_payment_id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL,
  debit_date TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_ars INTEGER NOT NULL,
  verified_at TEXT NOT NULL
) STRICT;

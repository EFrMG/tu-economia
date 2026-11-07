CREATE TABLE finance_users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  trial_started_at TEXT,
  trial_ends_at TEXT,
  CHECK ((trial_started_at IS NULL) = (trial_ends_at IS NULL))
) STRICT;

CREATE TABLE salary_months (
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  net_income_cents INTEGER NOT NULL CHECK (net_income_cents > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month)
) STRICT;

CREATE TABLE budget_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (user_id, id)
) STRICT;

CREATE INDEX budget_categories_by_user ON budget_categories(user_id, archived_at, sort_order);

CREATE TABLE monthly_allocations (
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  category_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month, category_id),
  FOREIGN KEY (user_id, category_id) REFERENCES budget_categories(user_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  incurred_on TEXT NOT NULL CHECK (incurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id, category_id) REFERENCES budget_categories(user_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX expenses_by_user_date ON expenses(user_id, incurred_on);

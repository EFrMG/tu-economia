CREATE UNIQUE INDEX expenses_user_id_id ON expenses(user_id, id);

CREATE TABLE planned_expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  amount_kind TEXT NOT NULL CHECK (amount_kind IN ('confirmed', 'estimate')),
  recurrence TEXT NOT NULL CHECK (recurrence IN ('once', 'monthly')),
  first_due_on TEXT NOT NULL CHECK (first_due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  last_due_on TEXT CHECK (last_due_on IS NULL OR last_due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES budget_categories(user_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX planned_expenses_by_user ON planned_expenses(user_id, first_due_on);

CREATE TABLE planned_expense_resolutions (
  user_id TEXT NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
  planned_expense_id TEXT NOT NULL,
  due_on TEXT NOT NULL CHECK (due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  state TEXT NOT NULL CHECK (state IN ('paid', 'skipped')),
  expense_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, planned_expense_id, due_on),
  UNIQUE (user_id, expense_id),
  CHECK ((state = 'paid' AND expense_id IS NOT NULL) OR (state = 'skipped' AND expense_id IS NULL)),
  FOREIGN KEY (user_id, planned_expense_id) REFERENCES planned_expenses(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, expense_id) REFERENCES expenses(user_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX planned_expense_resolutions_by_user_date ON planned_expense_resolutions(user_id, due_on);

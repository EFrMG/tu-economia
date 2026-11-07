-- Drop the unused normalized finance tables left by migrations 0001 and 0002.
-- The app stores each account's records as one JSON document (migrations 0004 and 0006);
-- nothing reads or writes these tables any more.
DROP TABLE IF EXISTS planned_expense_resolutions;
DROP TABLE IF EXISTS planned_expenses;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS monthly_allocations;
DROP TABLE IF EXISTS budget_categories;
DROP TABLE IF EXISTS salary_months;
DROP TABLE IF EXISTS finance_users;
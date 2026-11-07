-- Complete browser finance documents remain separate from the legacy normalized tables.
-- Enabling this requires explicit FINANCE_STORAGE_ENABLED=true and configured account access.
CREATE TABLE finance_sync_documents (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  document TEXT NOT NULL CHECK (json_valid(document)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

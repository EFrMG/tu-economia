-- Boletín Oficial digest (first section). The cron collects one edition per row here, so a day whose listing has no relevant notice is not fetched again on every tick.
CREATE TABLE boletin_editions (
  edition_date TEXT PRIMARY KEY, -- YYYY-MM-DD, the edition's date in Argentina
  collected_at TEXT NOT NULL,
  listed_count INTEGER NOT NULL,
  selected_count INTEGER NOT NULL
);

-- One relevant notice of an edition. The cron fills the summary one notice per run; pages only read rows that left 'pending'. No notice text is stored, only its metadata and the generated summary.
CREATE TABLE boletin_notices (
  id TEXT PRIMARY KEY, -- the Boletín's notice id, from /detalleAviso/primera/<id>/<YYYYMMDD>
  edition_date TEXT NOT NULL REFERENCES boletin_editions (edition_date) ON DELETE CASCADE,
  position INTEGER NOT NULL, -- order in the edition's listing
  rubro TEXT NOT NULL, -- DECRETOS, RESOLUCIONES, ...
  heading TEXT NOT NULL, -- the listing's first line: the agency, or the subject for decrees
  norm TEXT NOT NULL, -- the listing's detail lines: number and official reference
  url TEXT NOT NULL,
  has_annexes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'summarized', 'title_only', 'excluded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  summary TEXT,
  points TEXT, -- JSON array of strings
  affects_households INTEGER NOT NULL DEFAULT 0,
  partial INTEGER NOT NULL DEFAULT 0, -- the summary covers only the first articles
  operative_chars INTEGER,
  sent_chars INTEGER,
  neurons REAL,
  model TEXT,
  outcome TEXT, -- why a notice ended as title_only or excluded, or the last retryable error
  updated_at TEXT NOT NULL
);

CREATE INDEX boletin_notices_pending ON boletin_notices (status, edition_date, position);
CREATE INDEX boletin_notices_edition ON boletin_notices (edition_date, position);

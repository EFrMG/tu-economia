-- The last valid rows of each slow-changing upstream source (INDEC, EMAE, the BCRA, country risk, the dollar closes, SEC EDGAR), refreshed by the cron (daily, weekly for SEC EDGAR), so pages do not ask the source on every visit and an outage serves the last copy instead of an unavailable section.
CREATE TABLE source_snapshots (
  key TEXT PRIMARY KEY, -- the source and a schema version, such as 'indec:pobreza_eph@1'
  body TEXT NOT NULL, -- JSON array of rows, validated again when read
  fetched_at TEXT NOT NULL -- ISO time of the request that returned the rows
);

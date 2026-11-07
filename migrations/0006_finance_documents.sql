-- Finance storage is cloud-only; the table no longer serves an optional sync.
ALTER TABLE finance_sync_documents RENAME TO finance_documents;

-- Set once the lapsed-subscription deletion notice is delivered; cleared when an entitlement resumes.
ALTER TABLE finance_documents ADD COLUMN deletion_notice_sent_at TEXT;

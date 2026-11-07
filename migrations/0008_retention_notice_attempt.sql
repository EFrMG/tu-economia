-- The deletion clock starts at the first notice attempt, so an address that
-- cannot receive the message no longer keeps lapsed records forever. Cleared
-- together with the delivered notice when an entitlement resumes.
ALTER TABLE finance_documents ADD COLUMN deletion_notice_attempted_at TEXT;

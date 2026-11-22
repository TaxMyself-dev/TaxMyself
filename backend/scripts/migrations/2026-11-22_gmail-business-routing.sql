-- PREPARED ONLY. Elazar approved schema preparation on 2026-11-22, not execution.
-- Apply once, before running this release; no backfill or folder migration.
-- Inspect INFORMATION_SCHEMA.COLUMNS first if deployment history is uncertain.
ALTER TABLE user_integrations ADD COLUMN email_routing_json JSON NULL;
ALTER TABLE imported_documents ADD COLUMN email_routing_json JSON NULL;
ALTER TABLE extracted_document ADD COLUMN email_routing_json JSON NULL;

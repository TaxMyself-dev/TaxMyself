-- Explicitly approved for preparation and application to keepintax-dev only.
-- Inspect INFORMATION_SCHEMA.COLUMNS before applying; run once.
ALTER TABLE oauth_states ADD COLUMN business_number VARCHAR(32) NULL;

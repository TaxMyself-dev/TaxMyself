-- Outlook message IDs: PREPARED ONLY on 2026-11-23.
-- Elazar approved preparing this change only; application to any DB is NOT authorized.
-- Apply only this standalone statement after separate approval and live preflight.
-- Requires the existing durable intake schema; do not run the cumulative cutover file.
-- Preflight: verify message_id contains only ASCII, every value fits 512 characters,
-- and the table uses an InnoDB row format supporting a 3072-byte index key.
-- Preserve ux_email_item(run_id,message_id,part_path) without prefix truncation.
-- Conservative key payload: 36*4 + 512*1 + 160*4 = 1296 bytes (<3072).
-- ASCII binary collation preserves opaque case-sensitive Gmail/Outlook identities.
ALTER TABLE email_import_items
  MODIFY COLUMN message_id VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

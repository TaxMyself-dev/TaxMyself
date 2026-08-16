-- Form 6111 category/sub-category project, schema step (2026-08-14) — adds
-- category6111/subCategory6111 to booking_account. Independent of the
-- categories-redesign master plan (docs/redesign/) — not one of its D1-D15
-- decisions.
--
-- Run via 2026-08-14_add-category6111-columns-to-booking-account.js (raw
-- mysql2, bypasses NestJS/TypeORM so this can never race with
-- `synchronize`), same pattern as 2026-08-11_add-form-part-to-booking-account.sql.

ALTER TABLE booking_account
  ADD COLUMN category6111 VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'official Tax Authority Form 6111 category name',
  ADD COLUMN subCategory6111 VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'official Tax Authority Form 6111 sub-category name';

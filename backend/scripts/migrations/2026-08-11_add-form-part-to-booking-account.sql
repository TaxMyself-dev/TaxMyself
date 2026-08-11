-- Form 6111 reference-card project, Step 1 (2026-08-11) — adds the
-- formPart column to booking_account. Independent of the categories-redesign
-- master plan (docs/redesign/) — not one of its D1-D15 decisions.
--
-- Run via 2026-08-11_add-form-part-to-booking-account.js (raw mysql2,
-- bypasses NestJS/TypeORM so this can never race with `synchronize`), same
-- pattern as 2026-07-13_run-phase3-schema.js.

ALTER TABLE booking_account
  ADD COLUMN formPart ENUM('A','B','C') NULL DEFAULT NULL
  COMMENT 'חלק בטופס 6111: A=רוה"פ, B=התאמה למס, C=מאזן';

-- Form 6111 reference-card project, Step 3 prerequisite (2026-08-11) —
-- widens booking_account.type to nullable. The 321 imported reference cards
-- (isActive=false) have no reliable mechanical asset/liability/equity/
-- income/expense classification from the official form data (Part B tax-
-- adjustment lines don't fit any of the five values at all; several Part
-- A/C category groups are ambiguous) — NULL means "not yet determined",
-- same convention as code6111/vatPercent, never invent a value. Every
-- postable (isActive=true) card still requires a real type.
--
-- Run via 2026-08-11_import-6111-reference-cards.js (raw mysql2, bypasses
-- NestJS/TypeORM so this can never race with `synchronize`).

ALTER TABLE booking_account
  MODIFY COLUMN type VARCHAR(255) NULL DEFAULT NULL;

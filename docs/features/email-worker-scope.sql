-- Prepared for DEV and production; execution authorized for keepintax-dev ONLY.
-- Production: preparation only. A separate explicit approval/preflight is required.
-- Apply before enabling EMAIL_WORKER_SCOPE. Requires the existing email intake schema.
-- Nullable default preserves old writers and existing rows; no backfill/data UPDATE.
-- Existing unscoped work is not adopted by a scoped worker.
-- Update ALL shared DEV workers with explicit local/test routing before removing
-- temporary exclusive scanner ownership. An old worker ignores this column.
-- MySQL/InnoDB online DDL; stop on incompatible shape/version/unsupported algorithm.
ALTER TABLE email_import_runs
  ADD COLUMN worker_scope VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  ADD INDEX ix_email_runs_scope_due (worker_scope,pull_state,next_attempt_at,started_at),
  ALGORITHM=INPLACE, LOCK=NONE;

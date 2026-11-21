-- Composio managed Gmail schema. Applied to keepintax-dev with explicit approval on 2026-11-17.
-- PROD has not been modified. Preserve legacy columns; no data deletion.
-- For DEV reruns use backend/scripts/apply-composio-dev-schema.cjs; raw ALTER statements are not idempotent.
ALTER TABLE user_integrations
  ADD COLUMN connection_backend VARCHAR(32) NULL,
  ADD COLUMN connected_account_id VARCHAR(255) NULL,
  ADD COLUMN connection_verified_at DATETIME NULL,
  ADD COLUMN remote_disconnect_pending TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN retired_connected_account_ids JSON NULL,
  ADD UNIQUE INDEX ux_user_integrations_connected_account (connected_account_id);

ALTER TABLE oauth_states
  ADD COLUMN connected_account_id VARCHAR(255) NULL,
  ADD COLUMN target_integration_id INT NULL;

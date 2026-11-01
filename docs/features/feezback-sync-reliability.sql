-- Current Feezback reliability schema. Run only against the explicitly approved target.
-- Apply this reviewed section before deploying the matching backend.
-- Take the normal schema backup first. Do not rerun the entire historical cutover.sql.
-- Preflight: must return zero rows; stop for investigation otherwise.
SELECT `status`, COUNT(*) AS rows_count FROM `user_source_sync_state`
WHERE `status` NOT IN ('not_synced', 'success', 'failed', 'skipped_direct') GROUP BY `status`;

ALTER TABLE `user_source_sync_state`
  MODIFY COLUMN `status` varchar(32) NOT NULL DEFAULT 'not_synced';

ALTER TABLE `user_sync_state`
  MODIFY COLUMN `lastSourcesRefreshAt` timestamp(3) NULL DEFAULT NULL,
  MODIFY COLUMN `lastConsentInitiatedAt` timestamp(3) NULL DEFAULT NULL;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='source' AND COLUMN_NAME='metadataVerifiedAt')=0,
  'ALTER TABLE `source` ADD COLUMN `metadataVerifiedAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_source_sync_state' AND COLUMN_NAME='consentVerifiedAt')=0,
  'ALTER TABLE `user_source_sync_state` ADD COLUMN `consentVerifiedAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='lastSourcesRefreshAttemptAt')=0,
  'ALTER TABLE `user_sync_state` ADD COLUMN `lastSourcesRefreshAttemptAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='sourcesRefreshFailureReason')=0,
  'ALTER TABLE `user_sync_state` ADD COLUMN `sourcesRefreshFailureReason` varchar(255) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

-- Back up the old column before removing it from an existing installation.
SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='permissionsSnapshot')>0,
  'ALTER TABLE `user_sync_state` DROP COLUMN `permissionsSnapshot`', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='feezback_webhook_events' AND COLUMN_NAME='processing_started_at')=0,
  'ALTER TABLE `feezback_webhook_events` ADD COLUMN `processing_started_at` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

-- Verification: inspect type/default/nullability against the matching entities.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND
 ((TABLE_NAME='source' AND COLUMN_NAME='metadataVerifiedAt')
 OR (TABLE_NAME='user_source_sync_state' AND COLUMN_NAME IN ('status','consentVerifiedAt'))
 OR (TABLE_NAME='user_sync_state' AND COLUMN_NAME IN ('lastSourcesRefreshAt','lastConsentInitiatedAt','lastSourcesRefreshAttemptAt','sourcesRefreshFailureReason'))
 OR (TABLE_NAME='feezback_webhook_events' AND COLUMN_NAME='processing_started_at'));
-- Do not roll back to code requiring permissionsSnapshot after it has been removed.
-- Leave the wider status type and other nullable columns in place.
-- Narrowing back to the old enum would reject skipped_direct and is not a safe rollback.

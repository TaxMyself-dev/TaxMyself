-- Prepared only. NOT executed by the application or by this task.
-- Apply this additive section before deploying the matching backend.
-- Take the normal schema backup first. Do not rerun the entire historical cutover.sql.
-- Preflight: must return zero rows; stop for investigation otherwise.
SELECT `status`, COUNT(*) AS rows_count FROM `user_source_sync_state`
WHERE `status` NOT IN ('not_synced', 'success', 'failed', 'skipped_direct') GROUP BY `status`;

ALTER TABLE `user_source_sync_state`
  MODIFY COLUMN `status` varchar(32) NOT NULL DEFAULT 'not_synced';

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='source' AND COLUMN_NAME='metadataVerifiedAt')=0,
  'ALTER TABLE `source` ADD COLUMN `metadataVerifiedAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_source_sync_state' AND COLUMN_NAME='consentVerifiedAt')=0,
  'ALTER TABLE `user_source_sync_state` ADD COLUMN `consentVerifiedAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='permissionsSnapshot')=0,
  'ALTER TABLE `user_sync_state` ADD COLUMN `permissionsSnapshot` json NULL', 'SELECT 1');
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
 OR (TABLE_NAME='user_sync_state' AND COLUMN_NAME='permissionsSnapshot')
 OR (TABLE_NAME='feezback_webhook_events' AND COLUMN_NAME='processing_started_at'));
-- Rollback: revert code first; leave the wider status type and nullable columns in place.
-- Narrowing back to the old enum would reject skipped_direct and is not a safe rollback.

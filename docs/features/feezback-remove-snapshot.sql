-- Upgrade for the approved dev database; back up the old column before execution.
-- No permission list or source mapping is stored in the two operational fields.
-- Keep existing flow timestamps precise enough to distinguish attempts within one second.
ALTER TABLE `user_sync_state`
  MODIFY COLUMN `lastSourcesRefreshAt` timestamp(3) NULL DEFAULT NULL,
  MODIFY COLUMN `lastConsentInitiatedAt` timestamp(3) NULL DEFAULT NULL;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='lastSourcesRefreshAttemptAt')=0,
  'ALTER TABLE `user_sync_state` ADD COLUMN `lastSourcesRefreshAttemptAt` datetime(3) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='sourcesRefreshFailureReason')=0,
  'ALTER TABLE `user_sync_state` ADD COLUMN `sourcesRefreshFailureReason` varchar(255) NULL', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='permissionsSnapshot')>0,
  'ALTER TABLE `user_sync_state` DROP COLUMN `permissionsSnapshot`', 'SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;

SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_sync_state'
AND COLUMN_NAME IN ('lastSourcesRefreshAt','lastConsentInitiatedAt','lastSourcesRefreshAttemptAt','sourcesRefreshFailureReason','permissionsSnapshot');

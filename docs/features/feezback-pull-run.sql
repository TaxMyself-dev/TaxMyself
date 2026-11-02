-- Apply only to an explicitly approved database before starting the matching backend.
-- Nullable operational run identifiers. No financial data or permission-list copy.
SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='user_sync_state' AND COLUMN_NAME='fullRunId')=0,
 'ALTER TABLE `user_sync_state` ADD COLUMN `fullRunId` varchar(36) NULL','SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;
SET @ob_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='user_source_sync_state' AND COLUMN_NAME='resultRunId')=0,
 'ALTER TABLE `user_source_sync_state` ADD COLUMN `resultRunId` varchar(36) NULL','SELECT 1');
PREPARE ob_stmt FROM @ob_ddl; EXECUTE ob_stmt; DEALLOCATE PREPARE ob_stmt;
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='user_sync_state' AND COLUMN_NAME='fullRunId')
 OR (TABLE_NAME='user_source_sync_state' AND COLUMN_NAME='resultRunId'));

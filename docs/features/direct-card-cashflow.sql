-- Direct-card cashflow preference. MANUAL application before starting this version.
-- No deletion of transactions, expenses, rules, documents or journal entries.
-- MySQL: run in the selected application database. Rerunnable.
DELIMITER $$
DROP PROCEDURE IF EXISTS kt_direct_card_cashflow$$
CREATE PROCEDURE kt_direct_card_cashflow()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user' AND COLUMN_NAME='excludeDirectCardBankTransactionsFromCashflow') THEN
    ALTER TABLE `user` ADD COLUMN excludeDirectCardBankTransactionsFromCashflow tinyint NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sub_category' AND COLUMN_NAME='systemKey') THEN
    ALTER TABLE sub_category ADD COLUMN systemKey varchar(64) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sub_category' AND INDEX_NAME='UQ_sub_category_system_key') THEN
    ALTER TABLE sub_category ADD UNIQUE INDEX UQ_sub_category_system_key (systemKey);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='full_transactions_cache' AND COLUMN_NAME='sub_category_id') THEN
    ALTER TABLE full_transactions_cache ADD COLUMN sub_category_id int NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slim_transactions' AND COLUMN_NAME='sourceRecordId') THEN
    ALTER TABLE slim_transactions ADD COLUMN sourceRecordId int NULL;
  END IF;

  -- Do not silently repurpose an existing accounting/private classification.
  IF EXISTS (
    SELECT 1 FROM sub_category s INNER JOIN category c ON c.id=s.categoryId
    WHERE s.chartOwnerKey='SYSTEM' AND c.chartOwnerKey='SYSTEM'
      AND c.name='שונות' AND s.name='כרטיס דיירקט'
      AND (s.systemKey IS NULL OR s.systemKey<>'DIRECT_CARD_BANK_PAYMENT')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Existing system Direct label needs manual catalog review';
  END IF;

  INSERT INTO category (name, type, ownerType, chartOwnerKey, visibilityScope, isDefault, isActive)
  SELECT 'שונות', 'EXPENSE', 'SYSTEM', 'SYSTEM', 'SYSTEM_DEFAULT', 1, 1
  WHERE NOT EXISTS (SELECT 1 FROM category WHERE chartOwnerKey='SYSTEM' AND name='שונות' AND type='EXPENSE');

  INSERT INTO sub_category
    (categoryId, name, systemKey, isPrivate, accountId, necessity, ownerType, chartOwnerKey, visibilityScope, approvalStatus, isDefault, isActive)
  SELECT c.id, 'כרטיס דיירקט', 'DIRECT_CARD_BANK_PAYMENT', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', 'SYSTEM_DEFAULT', 'APPROVED', 1, 1
  FROM category c
  WHERE c.chartOwnerKey='SYSTEM' AND c.name='שונות' AND c.type='EXPENSE'
    AND NOT EXISTS (SELECT 1 FROM sub_category WHERE systemKey='DIRECT_CARD_BANK_PAYMENT');

  -- Copy only existing stable classification IDs/provenance; never guess by merchant name.
  UPDATE full_transactions_cache c INNER JOIN slim_transactions s
    ON s.userId=c.userId AND s.externalTransactionId=c.externalTransactionId
  SET c.sub_category_id=s.sub_category_id;
  UPDATE slim_transactions s INNER JOIN full_transactions_cache c
    ON s.userId=c.userId AND s.externalTransactionId=c.externalTransactionId
  SET s.sourceRecordId=c.sourceRecordId
  WHERE s.sourceRecordId IS NULL;

  -- Linked legacy Direct cards must participate in the next normal retry.
  UPDATE user_source_sync_state
  SET status='not_synced', transactionCount=0, error=NULL
  WHERE type='card' AND status='skipped_direct';
END$$
CALL kt_direct_card_cashflow()$$
DROP PROCEDURE kt_direct_card_cashflow$$
DELIMITER ;

SELECT id, categoryId, name, systemKey, isPrivate, accountId, isActive
FROM sub_category WHERE systemKey='DIRECT_CARD_BANK_PAYMENT';
SELECT COUNT(*) AS opted_in_users FROM `user`
WHERE excludeDirectCardBankTransactionsFromCashflow=1;

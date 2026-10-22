-- KT-091: persist which household identity owns each business.
-- Existing behavior treated every ambiguous row as the primary user. Preserve
-- that behavior, then upgrade only an unambiguous spouse-ID match.

SET @kt091_add_proprietor_role = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'business'
      AND COLUMN_NAME = 'proprietorRole'
  ),
  'SELECT 1',
  'ALTER TABLE `business` ADD COLUMN `proprietorRole` ENUM(''PRIMARY'',''SPOUSE'') NOT NULL DEFAULT ''PRIMARY'' AFTER `firebaseId`'
);
PREPARE kt091_stmt FROM @kt091_add_proprietor_role;
EXECUTE kt091_stmt;
DEALLOCATE PREPARE kt091_stmt;

UPDATE `business` b
INNER JOIN `user` u ON u.`firebaseId` = b.`firebaseId`
SET b.`proprietorRole` = 'SPOUSE'
WHERE u.`isCompany` = 0
  AND u.`spouseId` IS NOT NULL
  AND u.`spouseId` <> ''
  AND b.`businessNumber` = u.`spouseId`
  AND (u.`id` IS NULL OR b.`businessNumber` <> u.`id`);

UPDATE `business` b
INNER JOIN `user` u ON u.`firebaseId` = b.`firebaseId`
SET b.`proprietorRole` = 'PRIMARY'
WHERE u.`isCompany` = 1;

SELECT b.`id`, b.`firebaseId`, b.`businessNumber`, b.`proprietorRole`
FROM `business` b
LEFT JOIN `user` u ON u.`firebaseId` = b.`firebaseId`
WHERE u.`firebaseId` IS NULL
   OR (b.`proprietorRole` = 'SPOUSE' AND (u.`isCompany` = 1 OR u.`spouseId` IS NULL OR u.`spouseId` = ''));

-- ============================================================================
-- Phase 2.1 schema — category / sub_category tables (D1/D3/D4/D5).
-- NOT transactional — DDL auto-commits in MySQL. Run once against
-- keepintax_prodcopy before 2026-07-12_catalog_migration.ts's MODE=apply
-- (which only writes DATA, inside its own transaction).
--
-- No FOREIGN KEY constraints on sub_category.categoryId / sub_category.accountId
-- — matches the established precedent in 2026-07-10_chart_renumber.sql, which
-- added booking_account.sectionId as a plain INT with no FK constraint despite
-- the entity declaring @ManyToOne(AccountingSection). Same convention here.
--
-- Collation matches every other table in this DB (utf8mb4_0900_ai_ci),
-- verified against booking_account/accounting_section/journal_line etc.
-- ============================================================================

CREATE TABLE `category` (
  `id`                     INT           NOT NULL AUTO_INCREMENT,
  `name`                   VARCHAR(255)  NOT NULL,
  `type`                   ENUM('EXPENSE','INCOME') NOT NULL,
  `defaultRecognitionType` ENUM('RECOGNIZED','NOT_RECOGNIZED') NULL DEFAULT NULL,
  `ownerType`              ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey`          VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM',
  `accountantId`           VARCHAR(255)  NULL     DEFAULT NULL,
  `userId`                 VARCHAR(255)  NULL     DEFAULT NULL,
  `businessNumber`         VARCHAR(255)  NULL     DEFAULT NULL,
  `visibilityScope`        ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL,
  `isDefault`              TINYINT(1)    NOT NULL DEFAULT 0,
  `isActive`               TINYINT(1)    NOT NULL DEFAULT 1,
  `createdByUserId`        VARCHAR(255)  NULL     DEFAULT NULL,
  `createdAt`              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_owner_name_type` (`chartOwnerKey`, `name`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sub_category` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `categoryId`        INT           NOT NULL,
  `name`              VARCHAR(255)  NOT NULL,
  `isPrivate`         TINYINT(1)    NOT NULL DEFAULT 0,
  `accountId`         INT           NULL     DEFAULT NULL,
  `necessity`         ENUM('MANDATORY','IMPORTANT','OPTIONAL') NOT NULL DEFAULT 'IMPORTANT',
  `reportScope`       ENUM('pnl','annual') NOT NULL DEFAULT 'pnl',
  `ownerType`         ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey`     VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM',
  `accountantId`      VARCHAR(255)  NULL     DEFAULT NULL,
  `userId`            VARCHAR(255)  NULL     DEFAULT NULL,
  `businessNumber`    VARCHAR(255)  NULL     DEFAULT NULL,
  `visibilityScope`   ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL,
  `approvalStatus`    ENUM('APPROVED','PENDING_ACCOUNTANT_APPROVAL','MISSING_ACCOUNTING_MAPPING','REJECTED') NOT NULL DEFAULT 'APPROVED',
  `approvedByUserId`  VARCHAR(255)  NULL     DEFAULT NULL,
  `approvedAt`        DATETIME      NULL     DEFAULT NULL,
  `rejectedByUserId`  VARCHAR(255)  NULL     DEFAULT NULL,
  `rejectedAt`        DATETIME      NULL     DEFAULT NULL,
  `rejectionReason`   TEXT          NULL     DEFAULT NULL,
  `isDefault`         TINYINT(1)    NOT NULL DEFAULT 0,
  `isActive`          TINYINT(1)    NOT NULL DEFAULT 1,
  `createdByUserId`   VARCHAR(255)  NULL     DEFAULT NULL,
  `createdAt`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sub_category_owner_category_name` (`chartOwnerKey`, `categoryId`, `name`),
  KEY `idx_sub_category_categoryId` (`categoryId`),
  KEY `idx_sub_category_accountId` (`accountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

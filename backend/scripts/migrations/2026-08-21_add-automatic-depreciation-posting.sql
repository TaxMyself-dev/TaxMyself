-- Automatic annual depreciation posting (2026-08-21).
-- Run only during the reviewed deployment/cutover flow.

ALTER TABLE expense
  ADD COLUMN activationDate DATE NULL DEFAULT NULL AFTER date;

UPDATE expense
SET activationDate = date
WHERE isEquipmentSnapshot = 1 AND activationDate IS NULL;

ALTER TABLE journal_entry
  MODIFY COLUMN referenceType ENUM(
    'RECEIPT',
    'TAX_INVOICE',
    'TAX_INVOICE_RECEIPT',
    'TRANSACTION_INVOICE',
    'CREDIT_INVOICE',
    'EXPENSE',
    'PAYMENT',
    'MANUAL',
    'VAT_PAYMENT',
    'ADJUSTMENT',
    'OPENING_BALANCE',
    'DEPRECIATION'
  ) NULL;

CREATE TABLE asset_depreciation_posting (
  id INT NOT NULL AUTO_INCREMENT,
  expenseId INT NOT NULL,
  firebaseId VARCHAR(255) NOT NULL,
  businessNumber VARCHAR(255) NOT NULL,
  taxYear INT NOT NULL,
  activationDateSnapshot DATE NOT NULL,
  originalCostSnapshot DECIMAL(12,2) NOT NULL,
  depreciationRateSnapshot DECIMAL(5,2) NOT NULL,
  activeDays INT NOT NULL,
  daysInYear INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  sourceAccountCode VARCHAR(255) NOT NULL,
  journalEntryNumber INT NULL DEFAULT NULL,
  createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_depreciation_expense_year (expenseId, taxYear),
  KEY ix_asset_depreciation_business_year (businessNumber, taxYear),
  CONSTRAINT fk_asset_depreciation_expense
    FOREIGN KEY (expenseId) REFERENCES expense(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Verification
SELECT COUNT(*) AS equipment_without_activation_date
FROM expense
WHERE isEquipmentSnapshot = 1 AND activationDate IS NULL;

SHOW INDEX FROM asset_depreciation_posting;

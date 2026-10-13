-- Approved document redesign: prepare only; execute manually after backup/review.
-- Must be applied before deploying entity changes (production synchronize is off).
ALTER TABLE `documents` ADD COLUMN `issuerPdfSnapshot` JSON NULL;
-- Existing rows intentionally stay NULL: never adopt a future logo for old documents.

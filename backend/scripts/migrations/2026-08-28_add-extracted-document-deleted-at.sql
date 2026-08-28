ALTER TABLE `extracted_document`
  ADD COLUMN `deleted_at` datetime NULL DEFAULT NULL AFTER `status`;

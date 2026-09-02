-- Dedicated inbound email addresses, one opaque address per owned business.
-- Additive and safe for existing businesses: addresses are allocated lazily
-- by GET /inbound-email/me/addresses. Apply to production before deploying
-- code with MAILGUN_INBOUND_ENABLED=true.

CREATE TABLE IF NOT EXISTS `inbound_email_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `firebase_id` varchar(255) NOT NULL,
  `business_number` varchar(255) NOT NULL,
  `local_part` varchar(64) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_inbound_email_address_business` (`firebase_id`, `business_number`),
  UNIQUE KEY `ux_inbound_email_address_local_part` (`local_part`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Preserve email provenance in archive rows that already passed through the
-- Drive inbox. Covers both connected Gmail and dedicated Mailgun forwarding.
UPDATE `extracted_document` d
JOIN `imported_documents` i ON i.`drive_file_id` = d.`drive_file_id`
SET d.`source` = 'EMAIL'
WHERE i.`source` IN ('GMAIL', 'EMAIL_FORWARDING')
  AND d.`source` <> 'EMAIL';

-- Verification:
--   SHOW INDEX FROM inbound_email_addresses;
--   SELECT source, COUNT(*) FROM extracted_document GROUP BY source;

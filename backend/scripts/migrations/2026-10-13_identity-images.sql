-- Manual migration: apply before enabling image endpoints. Not executed by the application.
ALTER TABLE business ADD COLUMN logoPath VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE user ADD COLUMN profileImagePath VARCHAR(255) NULL DEFAULT NULL;

-- Adds the Google Drive root folder id for each user.
-- Populated by GoogleDriveService.createUserFolder() at signup.
-- In dev, TypeORM synchronize handles this automatically; this file is for prod.

ALTER TABLE `user`
  ADD COLUMN `drive_folder_id` VARCHAR(255) NULL DEFAULT NULL;

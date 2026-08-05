## Purpose
Wraps the Google Drive API (service-account auth) to provision and manage the per-user/per-business folder hierarchy (root → business → inbox/processed) used for document intake, uploads, sharing, and cleanup across the app.

## Key entities/files
- `google-drive.service.ts` — `GoogleDriveService`: the sole implementation, using a `GOOGLE_SERVICE_ACCOUNT_JSON` credential and `GOOGLE_DRIVE_ROOT_FOLDER_ID`. Key methods: `createUserFolder` (find-or-create user root, share with the user), `ensureBusinessFolder`/`ensureInboxAndProcessed` (business folder + `inbox/`/`processed/` children), `moveFile`, `listFolderFiles`, `uploadFile` (throws `ServiceAccountQuotaError` when the service account hits Google's storage-quota wall for personal Drives), `deleteFile`, `downloadFile`, `shareFolder`/`listFolderPermissions`/`revokeFolderAccess`, `folderExists`, `getFolderParents`.
- `google-drive.controller.ts` — `GoogleDriveController` at route `users` (shares the `users` route namespace), single `GET users/me/drive-folder` endpoint returning the caller's Drive folder id/URL.
- `google-drive.module.ts` — registers `User`/`Delegation` entities, exports `GoogleDriveService` for use by other modules.

## Main flows
- `GET /users/me/drive-folder` (auth) — returns the current user's provisioned Drive root folder id + shareable URL.
- Folder provisioning (called by other modules, not exposed directly here): `createUserFolder` → `ensureBusinessFolder` → `ensureInboxAndProcessed`, idempotent find-or-create at each level.
- File lifecycle: `uploadFile` (with quota-error signaling for manual-drop fallback), `listFolderFiles` (with md5 checksum for dedup), `moveFile` (inbox → processed), `deleteFile`, `downloadFile`.
- Access control: `shareFolder`/`revokeFolderAccess`/`listFolderPermissions` — used e.g. when delegating/un-delegating an accountant's access to a client's folders.

## Related topics
- users (`User` entity — stores `driveFolderId`; `UsersService.provisionDriveStructure`/`revokeAccountantDriveAccess` build on this service)
- delegation (`Delegation` entity registered in module; delegation grant/revoke flows call into Drive sharing)
- documents (`DocumentsModule` imports `GoogleDriveModule` for inbox scanning/OCR file handling)
- demo-data (`DemoDataModule` imports `GoogleDriveModule` for seeding sample Drive files and test-reset cleanup)
- business (per-business folder structure keyed by `Business` rows, though the `Business` entity itself isn't imported here — folder IDs are persisted by callers)

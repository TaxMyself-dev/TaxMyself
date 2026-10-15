## Purpose
Owns the user account entity/lifecycle (signup, signin, profile update, children), Firebase-auth integration, and per-user Google Drive folder provisioning.

## Key entities/files
- `user.entity.ts` (`User`) — full personal/business/spouse profile: `role[]`, `businessStatus`, `firebaseId`, `hasOpenBanking`, `driveFolderId`, `isCompany` (skips personal/spouse fields for company registrations), `lastLoginAt`/`previousLoginAt`.
- `child.entity.ts` (`Child`) — dependents linked by `parentUserID` (used for tax credit points).
- `user-module-subscription.entity.ts` (`UserModuleSubscription`) — per-`ModuleName` trial window and `payStatus`/price; billing-gate data that lives in this module.
- `auth.service.ts` (`AuthService`) — thin Firebase Admin `Auth` wrapper.
- `users.service.ts` (`UsersService`) — `signup`/`signin`, `updateUser`, children CRUD, `getAllUsers` (admin), Drive folder provisioning/audit/revocation, `getActiveAccountantEmailsForUser`/`isAccountant`/`isAdmin`.
- `users.controller.ts` — REST endpoints at the app root (`/signup`, `/signin`, `/get-user`, `/update-user`, `/children`, `/get-cities`, `/all-users`, plus Drive dev/admin endpoints).

## Main flows
- KT-053: signup forces hasOpenBanking=false, and profile updates strip this
  field. Only provider-verified discovery (or explicit demo seeding) sets it;
  it is not a user-editable billing permission.
- `POST /signup` — creates a `User` (+ associated `Business`/`Child` rows), ensures a trial `UserModuleSubscription`.
- `GET /signin` — loads user by `firebaseId`, rolls `lastLoginAt` → `previousLoginAt`.
- `PATCH /update-user`, `/children` — profile edits.
- Drive provisioning: `provisionDriveStructure`/`auditDriveShares`/`revokeAccountantDriveAccess`/`getDriveProvisioningStatus` — creates and audits the per-user Google Drive folder structure and accountant sharing.
- The legacy manual Drive provisioning endpoint under `auth/dev/drive` is
  retained for diagnostics but requires both Firebase authentication and the
  persisted administrator role.
- Role helpers: `getActiveAccountantEmailsForUser`/`isAccountant`/`isAdmin` used across the app for authorization checks.

## Related topics
Depends on: shared, google-drive (Drive folder provisioning), feezback, billing, business (`Business` entity), delegation (`Delegation` entity). Depended on by: nearly every other backend topic (reports, transactions, report-workflow, expenses, etc.) via `UsersService`/`User` entity.

## Profile image uploads
POST/GET/DELETE /auth/profile-image use Firebase authentication; mutations block role agent like update-user. Images use multipart file (5 MB), full raster decode, PNG/JPEG/WebP single-frame validation and <=16 MP, resized within 512 px. profileImagePath is nullable and stripped from generic update-user input. GET returns authenticated PNG bytes with private no-store/nosniff headers. Both identity image types use IdentityImagesModule; paths are server-generated, never public URLs. Migration is manual, not executed by the app.

## Optional spouse Feezback identity (2026-10-15)

The existing primary identity remains Firebase UID + _sub. Only explicit checkbox selection creates a consent link for UID + _sub_spouse. The final enrollment redirect reads server connection-options and offers the unchecked choice if hasOpenBanking OR hasSpouseFeezbackIdentity. It also covers direct page navigation and saved-card resumes.

Only a spouse data-ready webhook plus provider verification of a valid, unexpired consent linked to a source writes user.hasSpouseFeezbackIdentity=true. Profile writes and browser redirects cannot set it. The historical flag survives consent expiry. Known identities participate in discovery and sync; connection state is aggregated, with partial failures unable to clear prior state. Secondary source/normalized transaction identifiers have a deterministic _spouse suffix; retries resolve the corresponding SUB from that suffix. Primary identifiers are unchanged. No additional mapping table is used.

Apply the appended user-column SQL in docs/redesign/cutover.sql before deployment. No production or live provider operations are part of validation.

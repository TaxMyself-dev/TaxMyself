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
- `POST /signup` — creates a `User` (+ associated `Business`/`Child` rows), ensures a trial `UserModuleSubscription`.
- `GET /signin` — loads user by `firebaseId`, rolls `lastLoginAt` → `previousLoginAt`.
- `PATCH /update-user`, `/children` — profile edits.
- Drive provisioning: `provisionDriveStructure`/`auditDriveShares`/`revokeAccountantDriveAccess`/`getDriveProvisioningStatus` — creates and audits the per-user Google Drive folder structure and accountant sharing.
- Role helpers: `getActiveAccountantEmailsForUser`/`isAccountant`/`isAdmin` used across the app for authorization checks.

## Related topics
Depends on: shared, google-drive (Drive folder provisioning), feezback, billing, business (`Business` entity), delegation (`Delegation` entity). Depended on by: nearly every other backend topic (reports, transactions, report-workflow, expenses, etc.) via `UsersService`/`User` entity.

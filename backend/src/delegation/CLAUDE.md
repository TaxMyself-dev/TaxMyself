## Purpose
Manages accountant-client relationships ("delegations"): granting/viewing permissions on another user's data, inviting/approving access by email+JWT token, and letting accountants create and manage client accounts.

## Key entities/files
- `delegation.entity.ts` — `Delegation` entity: `userId` (owner, Firebase UID), `agentId` (delegate/accountant), `externalCustomerId`, `status` (`ACTIVE`/`REVOKED`), `scopes` (e.g. `DOCUMENTS_READ`, `DOCUMENTS_WRITE`). Unique index on `(agentId, externalCustomerId)`.
- `delegation.service.ts` — `DelegationService`: invitation/JWT email flow, permission queries, accountant client CRUD, Firebase user provisioning for new clients, Google Drive provisioning/revocation hooks (via `UsersService`).
- `delegation.controller.ts` — `DelegationController` at route `delegations`.
- `dtos/create-client-by-accountant.dto.ts` — `CreateClientByAccountantDto`: email, phone, name, dateOfBirth, businessType/name/number, address for accountant-created clients.

## Main flows
- `POST /delegations/invite` — accountant invites a user by email; sends a JWT-token approval link via `MailService`.
- `GET /delegations/approve-delegation?token=` — user approves the delegation, creating an `ACTIVE` `Delegation` row.
- `GET /delegations/users-for-agent/:agentId` — list of users (with business rows) delegated to a given agent/accountant.
- `GET /delegations/my-permissions` (auth) — list of agents who have permission on the current user's data.
- `POST /delegations/grant-view` (auth) — grant `DOCUMENTS_READ` scope to another user by email, with a notification email.
- `POST /delegations/create-client` (auth, accountant-only) — creates a Firebase Auth user, a `User` row, a `Business` row, a trial `Subscription`, a `Delegation` (`DOCUMENTS_READ`+`DOCUMENTS_WRITE`), and provisions Google Drive folders for the client (shared with the accountant).
- `DELETE /delegations/client/:clientId` (auth, accountant-only) — removes the delegation link (not the user) and revokes the accountant's Google Drive access.

## Related topics
- users (`UsersModule`, `UsersService` for Firebase ID lookup, trial subscription creation, Drive provisioning/revocation; `User`, `Child` entities)
- business (`Business` entity, created/read for client businesses)
- mail (`MailService` for invitation and grant-notification emails)
- google-drive (indirectly, via `UsersService.provisionDriveStructure` / `revokeAccountantDriveAccess`)
- documents (`SettingDocuments` entity registered in module)
- expenses (`Expense` entity registered in module, for `SharedService`)
- transactions (`Transactions` entity registered only to satisfy `SharedService` DI — marked as legacy leftover)
- shared (`SharedService`)

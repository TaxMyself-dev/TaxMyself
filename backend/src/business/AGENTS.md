## Purpose
Owns the `Business` entity — a user's registered business(es): identity/contact info, business type, VAT/tax reporting configuration, SHAAM OAuth tokens, and Google Drive folder linkage. CRUD is user-scoped. A delegated accountant may update the represented client's existing business through any ACTIVE delegation; create and delete remain owner-only.

## Key entities/files
- `business.entity.ts` — `Business`: firebaseId (owner), businessName/Number/Address/Phone/Email, `businessType` (enum, gated by `isBusinessTypeAllowedForUser`), `vatReportingType`/`taxReportingType` (drive accountant-tasks period generation), `advanceTaxPercent`, encrypted SHAAM tokens, `createdAt` (lower bound for task/workflow backfill), Drive folder ids (`driveFolderId`, `driveInboxFolderId`, `driveProcessedFolderId`).
- `business.service.ts` — `BusinessService`: `getUserBusinesses`, `getBusinessByNumber`, `createBusiness` (also fire-and-forget provisions Drive folders, including for delegated accountants), `updateBusiness`, `deleteBusiness`. Enforces `assertBusinessTypeAllowed` against the owner's `isCompany` flag.
- `business.controller.ts` — `/business` REST endpoints behind `FirebaseAuthGuard`; blocks `role === 'agent'` (accountant-as-client) from create/delete. Update is allowed in represented-client context and explicitly uses `DOCUMENTS_READ`, whose guard semantics require an ACTIVE delegation but also support legacy/view-only scope rows; the guard swaps `firebaseId` to the client before the service's owner-scoped lookup.
- `dtos/create-business.dto.ts`, `dtos/update-business.dto.ts` — request validation DTOs.

## Main flows
- `GET /business/get-businesses` — list the authenticated user's businesses.
- `POST /business/create` — create a business, validate business type against registration type, kick off Drive folder provisioning.
- `PATCH /business/update` — partial update (name/contact/type/VAT & tax reporting config/national-insurance flag); owner or accountant with any ACTIVE delegation.
- `DELETE /business/:id` — owner-only hard delete.

## Related topics
- users (`UsersService` for owner lookup, `isCompany` check, Drive-structure provisioning, active-accountant email lookup)
- delegation (accountant access to a client's businesses is delegation-gated at the controller/guard level)
- expenses, documents (registered in the module purely for `SharedService`'s injection needs, not used directly by `BusinessService`)
- accountant-tasks, annual-report (consume `Business.vatReportingType`/`taxReportingType`/`createdAt` to generate periods)

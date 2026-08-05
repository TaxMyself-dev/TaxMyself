## Purpose
Exposes a simple search endpoint over expenses that have an attached file (receipt/document), used for "my cloud" style lookups of previously stored receipts.

## Key entities/files
- `cloud.service.ts` — `CloudService.searchExpenses()`: query-builds over the `Expense` repo, filtering by user, date range, supplier, category, requiring `file IS NOT NULL`; defaults to the last 10 expenses when no filters are given.
- `cloud.controller.ts` — `CloudController` at route `my-cloud`, single `GET search` endpoint. Note: `userId` is currently hardcoded (`request.user.id` extraction is commented out) rather than taken from the authenticated request.
- `cloud.module.ts` — wires `Expense`, `User`, `Business`, `Child` TypeORM repos plus `SharedModule` and `UsersModule`.

## Main flows
- `GET /my-cloud/search?startDate&endDate&supplier&category` — returns matching expenses (supplier, date, category, subCategory, sum) that have a stored file, most recent first.

## Related topics
- expenses (queries the `Expense` entity directly)
- users (imports `UsersModule`, `AuthService`, `User`, `Child` entities)
- business (imports `Business` entity, though not used in the service logic shown)
- shared (imports `SharedModule`)

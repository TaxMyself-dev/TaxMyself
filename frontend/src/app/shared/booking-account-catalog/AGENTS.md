## Purpose

Maintains the system/accountant booking-account catalog, including creation,
activation, editing, deactivation, deletion checks, filtering and Excel export.

## Key entities/files

- `booking-account-catalog.component.ts` owns catalog modes and actions.
- The matching catalog service supplies system and accountant-scoped endpoints.

## Main flows

- Reference/system rows and accountant-owned rows have different allowed
  actions. Check usage before destructive/deactivating changes and surface
  blocking dependencies.
- Admin mode creates new SYSTEM cards through `POST admin/booking-accounts`;
  accountant mode keeps the client-scoped D11 `POST bookkeeping/accounts`
  flow. Both delegate to the atomic account + optional sub-category service.
- Business-type, report-scope and form-part metadata affect accounting/report
  behavior; the redesign master plan is binding for changes here.

## Related topics

- `backend/src/bookkeeping/AGENTS.md`
- `frontend/src/app/shared/category-management/AGENTS.md`

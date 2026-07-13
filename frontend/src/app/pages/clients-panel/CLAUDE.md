## Purpose
Accountant-facing panel: manage the list of clients (create/delete, drill into a client's account) and a "Tasks" tab for tracking/creating accountant tasks (VAT report, advance tax, annual report, custom) and marking report workflows as filed.

## Key entities/files
- `clients-panel.page.ts` — `ClientPanelPage`; three tabs — "הלקוחות שלי" (clients list), "משימות" (tasks), and "קטלוג וכרטיסים" (Phase 6.2 catalog management) — each with its own filters, modals, and CRUD actions.
- `clients-panel.module.ts` / `-routing.module.ts` — standard page module wiring.
- Depends on `ClientPanelService` (`src/app/services/clients-panel.service.ts` — `Client`, `CreateClientPayload` types), `TaskDataService`, `ReportWorkflowService`, `AuthService`.

## Main flows
- Fetch and list clients grouped by user with their linked businesses (`groupedClients`); create a new client (`submitCreateClient`) or remove a client link (`confirmDeleteClient`/`deleteClient`).
- "Enter" a client's account (impersonation-like view-as) — sets selected client + active business number, then navigates to `/my-account`.
- Tasks tab: fetch/filter accountant tasks by status/business/type/year, add a manual task, toggle completion, delete/hide auto-generated tasks, manually trigger the periodic task generator (`runGeneration`).
- For report-workflow-backed tasks (VAT/advance-tax/annual): mark/unmark as "reported", view the stored report file, or jump into the client's `/annual-report` page.
- Catalog tab (Phase 6.2): pending-approvals queue (`GET bookkeeping/pending-approvals` — MISSING/PENDING sub_categories across all ACTIVE-delegation clients with blocked-expense counts); per-client catalog overview (`GET bookkeeping/catalog-overview`, sent with a per-request `x-client-user-id` so the delegation-aware context merges CLIENT > ACCOUNTANT > SYSTEM; owner badges + isEffective); D11 "כרטיס חדש" dialog → `POST bookkeeping/accounts` (sections from `GET bookkeeping/sections`; CURRENT_CLIENT rides the impersonation header + dto.businessNumber). All via `BookkeepingCatalogService` (`src/app/services/bookkeeping-catalog.service.ts`).

## Related topics
- Backend `clients` module (client CRUD via `ClientPanelService`).
- Backend `accountant-tasks` module (`TaskDataService` — task list/add/update/delete, periodic generation).
- Backend `report-workflow` module (`ReportWorkflowService` — mark reported, fetch report file).
- Frontend `annual-report` — deep-links into it with a "view-as-client" context.

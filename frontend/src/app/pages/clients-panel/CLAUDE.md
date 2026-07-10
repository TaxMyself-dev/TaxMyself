## Purpose
Accountant-facing panel: manage the list of clients (create/delete, drill into a client's account) and a "Tasks" tab for tracking/creating accountant tasks (VAT report, advance tax, annual report, custom) and marking report workflows as filed.

## Key entities/files
- `clients-panel.page.ts` — `ClientPanelPage`; two tabs — "הלקוחות שלי" (clients list) and "משימות" (tasks) — each with its own filters, modals, and CRUD actions.
- `clients-panel.module.ts` / `-routing.module.ts` — standard page module wiring.
- Depends on `ClientPanelService` (`src/app/services/clients-panel.service.ts` — `Client`, `CreateClientPayload` types), `TaskDataService`, `ReportWorkflowService`, `AuthService`.

## Main flows
- Fetch and list clients grouped by user with their linked businesses (`groupedClients`); create a new client (`submitCreateClient`) or remove a client link (`confirmDeleteClient`/`deleteClient`).
- "Enter" a client's account (impersonation-like view-as) — sets selected client + active business number, then navigates to `/my-account`.
- Tasks tab: fetch/filter accountant tasks by status/business/type/year, add a manual task, toggle completion, delete/hide auto-generated tasks, manually trigger the periodic task generator (`runGeneration`).
- For report-workflow-backed tasks (VAT/advance-tax/annual): mark/unmark as "reported", view the stored report file, or jump into the client's `/annual-report` page.

## Related topics
- Backend `clients` module (client CRUD via `ClientPanelService`).
- Backend `accountant-tasks` module (`TaskDataService` — task list/add/update/delete, periodic generation).
- Backend `report-workflow` module (`ReportWorkflowService` — mark reported, fetch report file).
- Frontend `annual-report` — deep-links into it with a "view-as-client" context.

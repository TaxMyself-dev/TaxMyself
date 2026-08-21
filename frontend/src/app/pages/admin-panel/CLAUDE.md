## Purpose
Internal admin console (tabbed) for staff to manage clients dashboard, categories, transactions, demo data, billing/Cardcom, SHAAM invoice-approval, and the product documentation center — the single page most non-client-facing admin tools live under.

## Key entities/files
- `admin-panel.page.ts` — `AdminPanelPage`; holds the tab list (`tabs`) and drives which shared management component is shown, plus SHAAM approval dialog state.
- `admin-panel.module.ts` — declares the page and imports the five embedded feature components (`ClientsDashboardComponent`, `CategoryManagementComponent`, `TransManagementComponent`, `DemoDataComponent`, `AdminBillingComponent`) plus `ShaamInvoiceApprovalDialogComponent`.
- `admin-panel-routing.module.ts` — single root route rendering `AdminPanelPage`.
- `admin-documentation.component.*` — documentation-center shell: module cards, full-text search, active module/topic state, and the structured content model for accounting, open banking, and billing.
- `documentation-topic.component.*` — responsive topic reader: topic navigation, behavior cards, flow diagram, callouts, and edge-case notes. Split from the shell to keep each lazy component stylesheet below the Angular component-style budget.

## Main flows
- Switch between tabs: clients dashboard, category management, transaction management, demo data, billing/Cardcom.
- Open a SHAAM invoice-approval dialog and show a success toast with the returned confirmation number.
- Browse/search operational documentation across the three main modules and switch between their sub-topics without leaving the admin panel.

## Related topics
- Frontend shared: `clients-dashboard`, `category-management`, `trans-management`, `demo-data`, `admin-billing`.
- Backend: `shaam` (invoice approval dialog), `billing` (Cardcom/subscriptions tab), `clients`, `expenses`/`transactions` (via the embedded management components).

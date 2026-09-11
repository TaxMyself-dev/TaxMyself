## Purpose
Internal admin console (tabbed) for staff to manage clients dashboard, the unified categories/cards catalog area, transactions, demo data, billing/Cardcom, SHAAM invoice-approval, educational content, and the product documentation center — the single page most non-client-facing admin tools live under.

## Key entities/files
- `admin-panel.page.ts` — `AdminPanelPage`; holds the top-level tab list (`tabs`), the nested catalog tabs (`catalogTabs`: categories/cards), and drives which shared management component is shown, plus SHAAM approval dialog state.
- `admin-panel.module.ts` — declares the page and imports the five embedded feature components (`ClientsDashboardComponent`, `CategoryManagementComponent`, `TransManagementComponent`, `DemoDataComponent`, `AdminBillingComponent`) plus `ShaamInvoiceApprovalDialogComponent`.
- `admin-panel-routing.module.ts` — single root route rendering `AdminPanelPage`.
- `admin-documentation.component.*` — documentation-center shell: module cards, full-text search, active module/topic state, and the structured content model for accounting, open banking, and billing.
- `documentation-topic.component.*` — responsive topic reader: topic navigation, behavior cards, flow diagram, callouts, and edge-case notes. Split from the shell to keep each lazy component stylesheet below the Angular component-style budget.
- `admin-content.component.*` — admin content hub and guide launcher.
- `self-employed-guide.component.*` — RTL 16:9 presentation viewer. The eight-screen `הדרכה לעצמאים` guide supports button and keyboard navigation plus a fullscreen mode that keeps the controls visible; it is separate from the hub to keep component styles within the Angular budget.
- `self-employed-opening-slide.component.*` — the approved illustrated road-sign and magnifying-glass scenes for the business-type and tax-authority screens.
- `self-employed-income-tax-slides.component.*` — shell for the four explanatory Income Tax screens. The visual scenes are split between `self-employed-income-overview.component.*` and `self-employed-income-flow.component.*` to preserve the approved folder/barrier/conveyor layouts without breaching the Angular component-style budget.
- `frontend/src/assets/self-employed-guide/*-v2.png` — transparent character cutouts derived from the approved visual designs. Copy and figures stay in HTML; the PNGs are decorative only.
- `self-employed-tax-simulator.component.*` — interactive 2026 annual Income Tax illustration. It derives business profit, combines salary and business profit, applies the central tax brackets and credit-point value, then subtracts salary withholding. It is educational only and intentionally excludes National Insurance, pension, and additional tax benefits.
- `self-employed-guide.content.ts` / `self-employed-guide.figures.ts` — slide copy, official source links, and centrally maintained year-specific figures. The opening sequence deliberately distinguishes VAT status (`פטור`/`מורשה`), the Income Tax `בעל עסק זעיר` route, and company legal form; update changing tax figures in the figures file rather than hard-coding them in the presentation template.

## Main flows
- Switch between top-level tabs; categories and booking cards share one catalog-management tab with a second nested tab bar.
- In the nested Cards tab, administer SYSTEM cards and create a new SYSTEM card (plus its paired SYSTEM sub-category unless marked technical-only).
- Open a SHAAM invoice-approval dialog and show a success toast with the returned confirmation number.
- Browse/search operational documentation across the three main modules and switch between their sub-topics without leaving the admin panel.
- Open the Content tab, launch the self-employed guide, move between its eight HTML screens with on-screen controls or the RTL keyboard mapping (left arrow advances, right arrow returns, Escape closes), enter the Income Tax sequence from the authorities screen, adjust the final tax simulation, and optionally present the guide fullscreen. VAT and National Insurance detail chapters remain visibly marked as future content.

## Related topics
- Frontend shared: `clients-dashboard`, `category-management`, `booking-account-catalog`, `trans-management`, `demo-data`, `admin-billing`.
- Backend: `shaam` (invoice approval dialog), `billing` (Cardcom/subscriptions tab), `clients`, `expenses`/`transactions` (via the embedded management components).

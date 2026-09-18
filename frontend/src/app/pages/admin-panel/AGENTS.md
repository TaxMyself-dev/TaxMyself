## Purpose
Internal admin console (tabbed) for staff to manage clients dashboard, the unified categories/cards catalog area, transactions, demo data, billing/Cardcom, SHAAM invoice-approval, educational content, and the product documentation center — the single page most non-client-facing admin tools live under.

## Key entities/files
- `admin-panel.page.ts` — `AdminPanelPage`; holds the top-level tab list (`tabs`), the nested catalog tabs (`catalogTabs`: categories/cards), and drives which shared management component is shown, plus SHAAM approval dialog state.
- `admin-panel.module.ts` — declares the page and imports the five embedded feature components (`ClientsDashboardComponent`, `CategoryManagementComponent`, `TransManagementComponent`, `DemoDataComponent`, `AdminBillingComponent`) plus `ShaamInvoiceApprovalDialogComponent`.
- `admin-panel-routing.module.ts` — single root route rendering `AdminPanelPage`.
- `admin-documentation.component.*` — documentation-center shell: module cards, full-text search, active module/topic state, and the structured content model for accounting, open banking, and billing.
- `documentation-topic.component.*` — responsive topic reader: topic navigation, behavior cards, flow diagram, callouts, and edge-case notes. Split from the shell to keep each lazy component stylesheet below the Angular component-style budget.
- `admin-content.component.*` — admin content hub and guide launcher.
- `self-employed-guide.component.*` — RTL 16:9, 19-screen guide: introductory/Income Tax sequence (14 screens), two VAT artworks, two National Insurance artworks and the live NI calculator. Buttons, protected-input RTL keyboard navigation and fullscreen use the same shell. Static artwork uses contain, never crop; simulator components stay mounted but hidden to preserve input state.
- `frontend/src/assets/self-employed-guide/*-approved.png` — the approved visual compositions and the visual source of truth for the static guide screens. Render these artworks directly instead of reconstructing them from approximate HTML cards; add transparent HTML interaction layers only where navigation is required.
- `self-employed-opening-slide.component.*`, `self-employed-income-tax-slides.component.*`, `self-employed-income-overview.component.*`, and `self-employed-income-flow.component.*` — retained scene components from the earlier HTML reconstruction. They are not used by the current guide viewer while the approved artwork is the locked visual source of truth.
- `self-employed-tax-simulator.component.*` — interactive 2026 annual Income Tax illustration; subtracts salary withholding, paid advances and client withholding once. Reused at the chapter conclusion with values preserved. Excludes NI, pension and additional tax benefits.
- `guide-national-insurance.component.*` / `guide-national-insurance.ts` — three-column live educational NI calculator with monthly profit/salary and weekly hours. Status is derived, not selected. Central 2026 constants; salary-first bands/cap; NI-only 52% base adjustment for regular self-employed route; nonqualifying exemption and personal minimum. No API/backend/customer data. Ages 18 to retirement; excludes pension deductions, special statuses and micro-specific calculation. Tests cover thresholds, minimum, cap, adjustment and real DOM input/navigation.
- `docs/marketing/income-tax-guide.md` and `docs/marketing/vat-national-insurance-guide.md` — approved artwork provenance, locked copy/decisions, calculator assumptions, official evidence and verification.
- `self-employed-guide.content.ts` / `self-employed-guide.figures.ts` — semantic slide copy, official source links, and centrally maintained year-specific figures. The opening sequence deliberately distinguishes VAT status (`פטור`/`מורשה`), the Income Tax `בעל עסק זעיר` route, and company legal form. The interactive simulator reads changing figures from code; static approved artwork containing a changing figure must be regenerated or receive a precisely masked HTML overlay when that figure changes.

## Main flows
- Switch between top-level tabs; categories and booking cards share one catalog-management tab with a second nested tab bar.
- In the nested Cards tab, administer SYSTEM cards and create a new SYSTEM card (plus its paired SYSTEM sub-category unless marked technical-only).
- Open a SHAAM invoice-approval dialog and show a success toast with the returned confirmation number.
- Browse/search operational documentation across the three main modules and switch between their sub-topics without leaving the admin panel.
- Open Content and launch the guide; navigate 19 screens with buttons/RTL keyboard, enter any of the three authority chapters via transparent hotspots, adjust either simulator, and present fullscreen. NI rights/advance-payment follow-up slides remain undesigned and are not included. Temporary local `main.ts` visual-review bootstrap must never be committed; normal application access remains admin-only.

## Related topics

- NI money controls are slider-only, 1000–50000 NIS (step 100), with noneditable
  output labels; hours remain 0–80 with number input. Zero-salary illustration is
  supported by calculation tests but not selectable in this user-requested UI.
- Frontend shared: `clients-dashboard`, `category-management`, `booking-account-catalog`, `trans-management`, `demo-data`, `admin-billing`.
- Backend: `shaam` (invoice approval dialog), `billing` (Cardcom/subscriptions tab), `clients`, `expenses`/`transactions` (via the embedded management components).

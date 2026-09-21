## Purpose
Internal admin console (tabbed) for staff to manage clients dashboard, the unified categories/cards catalog area, transactions, demo data, billing/Cardcom, SHAAM invoice-approval, educational content, and the product documentation center — the single page most non-client-facing admin tools live under.

## Key entities/files
- `admin-panel.page.ts` — `AdminPanelPage`; holds the top-level tab list (`tabs`), the nested catalog tabs (`catalogTabs`: categories/cards), and drives which shared management component is shown, plus SHAAM approval dialog state.
- `admin-panel.module.ts` — declares the page and imports the five embedded feature components (`ClientsDashboardComponent`, `CategoryManagementComponent`, `TransManagementComponent`, `DemoDataComponent`, `AdminBillingComponent`) plus `ShaamInvoiceApprovalDialogComponent`.
- `admin-panel-routing.module.ts` — single root route rendering `AdminPanelPage`.
- `admin-documentation.component.*` — documentation-center shell: module cards, full-text search, active module/topic state, and the structured content model for accounting, open banking, and billing.
- `documentation-topic.component.*` — responsive topic reader: topic navigation, behavior cards, flow diagram, callouts, and edge-case notes. Split from the shell to keep each lazy component stylesheet below the Angular component-style budget.
- `admin-content.component.*` — admin content hub and guide launcher.
- `self-employed-guide.component.*` — RTL 16:9, 21-screen guide: introductory/Income Tax sequence (16 screens), two VAT artworks, two National Insurance artworks and the live NI calculator. The opening preserves the approved Kipi panel and restores only the sharper original left illustration via a diagonal CSS layer. The second-screen glossary retains the approved Kipi/title/icons/logo, with semantic HTML rows for uniformly sized, right-aligned terms and definitions. Original raster rows are masked to avoid duplicate text. Buttons, protected-input RTL keyboard navigation and fullscreen use the same shell. Static artwork uses contain, never crop; simulator components stay mounted but hidden to preserve input state.
- `frontend/src/assets/self-employed-guide/*-approved.png` — approved visual compositions and the source of truth for static guide screens. Render directly except for user-approved, precisely aligned quality corrections (opening illustration restoration and native glossary text); keep interaction layers transparent where navigation is required.
- `self-employed-opening-slide.component.*`, `self-employed-income-tax-slides.component.*`, `self-employed-income-overview.component.*`, and `self-employed-income-flow.component.*` — retained scene components from the earlier HTML reconstruction. They are not used by the current guide viewer while the approved artwork is the locked visual source of truth.
- `self-employed-tax-simulator.component.*` — interactive 2026 annual Income Tax illustration; subtracts salary withholding, paid advances and client withholding once. Reused at the chapter conclusion with values preserved. Excludes NI, pension and additional tax benefits.
- `guide-national-insurance.component.*` / `guide-national-insurance.ts` — three-column live educational NI calculator with monthly profit/salary and weekly hours. Status is derived, not selected. Central 2026 constants; salary-first bands/cap; NI-only 52% base adjustment for regular self-employed route; nonqualifying exemption and personal minimum. No API/backend/customer data. Ages 18 to retirement; excludes pension deductions, special statuses and micro-specific calculation. Tests cover thresholds, minimum, cap, adjustment and real DOM input/navigation.
- `docs/marketing/income-tax-guide.md` and `docs/marketing/vat-national-insurance-guide.md` — approved artwork provenance, locked copy/decisions, calculator assumptions, official evidence and verification.
- `self-employed-guide.content.ts` / `self-employed-guide.figures.ts` — semantic slide copy, official source links, and centrally maintained year-specific figures. The opening sequence deliberately distinguishes VAT status (`פטור`/`מורשה`), the Income Tax `בעל עסק זעיר` route, and company legal form. The interactive simulator reads changing figures from code; static approved artwork containing a changing figure must be regenerated or receive a precisely masked HTML overlay when that figure changes.

## Main flows

- Slide 7 Kipi follow-up: reduced size about 20%, blue bib overalls, khaki hat and handheld digging shovel, still standing on the kibbutz sign. Latest source `exec-5665afbb-f6ed-40f9-af46-aadd5ddcea9b.png` replaces the same `micro-blockers-approved.png` asset. Built-in precise-object-edit prompt changed only Kipi's size, outfit and shovel; slide text/layout remain unchanged.

- Main slide 7 (`micro-blockers`) artwork uses three readable lines `חלק מההכנסה / מגיע / מהמעסיק`. Kipi stands on the kibbutz-member sign in a khaki hat and blue work clothes, with all other content preserved. Built-in image-edit source: `exec-1a6168da-fdc8-4710-a0bb-d0c688bfb4e7.png`; saved as `frontend/src/assets/self-employed-guide/micro-blockers-approved.png`. Prompt scope: fix that caption and add reference-matched Kipi only, leaving headings, five signs, person, logo and footer intact.

- Status-comparison artwork revision: `exec-ff3d4736-2109-4e27-8dba-44ee02c36574.png`, built-in image edit. Prompt scope: new eligibility heading and five right-side check icons/right-aligned rows, then remove the scientist and her magnifying glass and restore the office background; retain eligibility copy and 2026 figures. Saved as `frontend/src/assets/self-employed-guide/status-comparison-approved.png`.

- Main slide 5 micro-business annual-report text includes `(ניכוי 30% הוצאות)` in the artwork and content description. No calculation or eligibility changes.

- Main slide 6 (`status-comparison`) title is `מי יכול להיות פטור, ומי זעיר?`. Its five checklist rows use right-side check icons and right-aligned text; eligibility copy and figures are unchanged.

- Obligations-folder items use RTL layout: icons on the right of right-aligned text, in all three folders.

- Main slide 5 (`income-tax-overview`) is `החובות של כל עסק`, with Kipi and obligations grouped by authority. Exempt VAT declaration is annual, authorized VAT reporting periodic, micro VAT obligations follow its VAT classification; NI reporting/payment depends on status and income. Evidence and artwork provenance: `docs/marketing/business-obligations-slide.md`.

- Guide navigation is eight main slides (cover, glossary, employee, business types, income overview, status comparison, micro blockers, authorities) plus isolated Income Tax (8), VAT (2), and NI (3) chapters. Counters/progress are chapter-local. Previous is disabled on the first slide; Next on the final chapter slide and the explicit return control return to main slide 8. Escape outside fullscreen returns from a chapter. Simulators stay mounted. Earlier linear-navigation descriptions below are superseded by this flow.

- Combined-income heading is `שכיר וגם עצמאי? בסוף שנה הכל נפגש`; approved text-only image edit `exec-075936c2-4826-4c7d-84b0-c711225b1850.png` preserves the profit-only conveyor.

- The combined-income artwork shows revenue minus expenses upstream; only cards labelled `רווח מהעסק` continue into the calculator alongside salary slips. Source edit: `exec-2a71480a-ca58-4207-bed5-c15324b7f2d2.png`, built-in image generation, scoped prompt: replace downstream revenue/expense receipts with business-profit cards and preserve all other artwork.

- The Income Tax hotspot on the authorities slide opens `income-combination` (salary plus business profit). The linear slide order is unchanged.

- Business-registration slide uses the user-approved title `סוגי רישום העסקים בישראל` as a native heading over the original artwork heading; all other artwork remains unchanged.
- Switch between top-level tabs; categories and booking cards share one catalog-management tab with a second nested tab bar.
- In the nested Cards tab, administer SYSTEM cards and create a new SYSTEM card (plus its paired SYSTEM sub-category unless marked technical-only).
- Open a SHAAM invoice-approval dialog and show a success toast with the returned confirmation number.
- Browse/search operational documentation across the three main modules and switch between their sub-topics without leaving the admin panel.
- Open Content and launch the guide; navigate 21 screens with buttons/RTL keyboard, enter any of the three authority chapters via transparent hotspots, adjust either simulator, and present fullscreen. Kipi opening/glossary provenance and locked copy are in `docs/marketing/kipi-guide-approved.md`. NI rights/advance-payment follow-up slides remain undesigned and are not included. Temporary local `main.ts` visual-review bootstrap must never be committed; normal application access remains admin-only.

## Related topics

- Screen 3 (`employee-payroll`) is the exact approved employee/employer artwork,
  with the updated headline `כשאתם שכירים, המעסיק מטפל בהכל` (2026-09-22).
  immediately after the glossary. Provenance, locked design and presenter caveats:
  `docs/marketing/employee-payroll-slide.md`. Its net salary is illustrative only.

- NI money controls are slider-only, 1000–50000 NIS (step 100), with noneditable
  output labels; hours remain 0–80 with number input. Zero-salary illustration is
  supported by calculation tests but not selectable in this user-requested UI.
- Frontend shared: `clients-dashboard`, `category-management`, `booking-account-catalog`, `trans-management`, `demo-data`, `admin-billing`.
- Backend: `shaam` (invoice approval dialog), `billing` (Cardcom/subscriptions tab), `clients`, `expenses`/`transactions` (via the embedded management components).

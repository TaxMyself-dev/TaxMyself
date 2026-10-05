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
- `self-employed-tax-simulator.component.*` — interactive 2026 annual Income Tax illustration; subtracts salary withholding, paid advances and client withholding once. Appears only at the Income Tax chapter conclusion, with values preserved between visits. Excludes NI, pension and additional tax benefits.
- `guide-national-insurance.component.*` / `guide-national-insurance.ts` — three-column live educational NI calculator with monthly profit/salary and weekly hours. Status is derived, not selected. Central 2026 constants; salary-first bands/cap; NI-only 52% base adjustment for regular self-employed route; nonqualifying exemption and personal minimum. No API/backend/customer data. Ages 18 to retirement; excludes pension deductions, special statuses and micro-specific calculation. Tests cover thresholds, minimum, cap, adjustment and real DOM input/navigation.
- `docs/marketing/income-tax-guide.md` and `docs/marketing/vat-national-insurance-guide.md` — approved artwork provenance, locked copy/decisions, calculator assumptions, official evidence and verification.
- `self-employed-guide.content.ts` / `self-employed-guide.figures.ts` — semantic slide copy, official source links, and centrally maintained year-specific figures. The opening sequence deliberately distinguishes VAT status (`פטור`/`מורשה`), the Income Tax `בעל עסק זעיר` route, and company legal form. The interactive simulator reads changing figures from code; static approved artwork containing a changing figure must be regenerated or receive a precisely masked HTML overlay when that figure changes.

## Main flows

- Expense principle and depreciation are approved static artworks on main slides 12–13. `expense-principle` now uses the centered, character-free “מנצלים את כל ההוצאות שמגיעות לנו” visual with restrained mint/blue/lavender stages and no decorative lime rays. `expense-depreciation` uses the matching calmer two-panel visual, with a subtle digital-ad card instead of a megaphone and no character. Both use the existing contain renderer; the expense calculator remains native and unchanged on slide 14. Counts remain 20 main/31 total. Provenance and locked copy: `docs/marketing/expense-savings-slides.md` and `docs/marketing/expense-depreciation-slide.md`.

- Main slides 10–11, immediately after the recap, are now the approved `practical-transition` artwork and a single `income-documents` artwork. They replace the separate exempt/authorized document slides, so counts remain 20 main/31 total and all chapter navigation is unchanged. Both PNGs are copied losslessly and rendered with contain. The combined document slide shows the exempt path (transaction account before payment, receipt on payment), the authorized cash-basis example (transaction account before payment, tax invoice-receipt on payment), and the framed tax-invoice-to-receipt path. No calculator, reporting rule, or tax model changed. Provenance and presenter boundaries: `docs/marketing/income-documents-slides.md`.

- Expense principle/depreciation/calculator now occupy main slides 12–14 before study-fund and pension slides (15–18). Counts remain 20 main/31 total; hub and chapters unchanged. The native expense principle slide uses a single receipt → smaller taxable profit → lower tax/NI flow with a liability qualifier, concise VAT line and retained micro-route exception. No calculator or tax model changes. Typography/layout changes are scoped to principle mode.

- The approved recap `learning-summary` is now main slide 9, immediately after `tax-authorities`, followed by exempt/authorized documents at 10–11. There are 20 main/31 total screens; chapter sequences and return hub remain unchanged. Original image `exec-e5db6cb9-bfcb-47b7-aa89-82de26588194.png` is copied losslessly to `learning-summary-approved.png` and rendered with contain. This supersedes the recap-pending note and counts below. No content or calculator changes.

- Approved document slides are main slides 9–10 immediately after the authorities hub: `exempt-documents`, then `authorized-documents`. Now 19 main/30 total screens; chapters unchanged. Exact original PNGs are displayed using the existing contain renderer, without recompression. Exempt source: `exec-dff672b0-e16a-471f-bfff-7c1ad1173952.png`; authorized source: `exec-520c0bd8-d57a-4f85-8b7d-50ac1fcf7a85.png` under the thread's generated-images directory. Receipt means payment acknowledgement, issued on receipt of money. `חשבון עסקה` denotes a payment request, not payment proof; it is not a replacement name for the statutory `חשבונית עסקה`. Authorized artwork additionally distinguishes tax invoice and combined invoice/receipt and retains the invoice-timing qualification. Evidence: https://www.kolzchut.org.il/he/הוצאת_חשבונית_מס,_חשבונית_עסקה_וקבלה . The separate recap preview is not implemented by this request.

- NI chapter now has four slides: status, payment, native `ni-rates`, calculator. Rates come from the same `NI_2026` constants as the calculator, show NI plus health breakdown, exemption, salary-first reduced band and cap. 17 main/28 total. `ni-payment` has a narrowly masked native minimum-payment caption to avoid blurry raster text; original wording unchanged.

- Income chapter now has five slides: separate `advances-adjustment` and `micro-reporting` screens removed. Slide 3 includes requesting updated advances after material business changes; slide 4 payment artwork ends with withholding and micro-business notes. Final calculator returns to the authorities hub. Its seven sliders increase left-to-right while Hebrew labels retain RTL. Historical counts below are superseded.

- Income chapter slide 3 artwork omits the small illustrative/VAT caption as requested on 2026-10-03. Same asset path and contain rendering; calculation and example unchanged. Provenance and retained assumptions: `docs/marketing/income-tax-guide.md`.

- Current expense versus depreciation is main slide 14, between expense principle and savings calculator (17 main/29 total). Exact approved PNG uses contain rendering; small bottom notes are removed but the VAT banner remains. No calculator/engine changes. Assumptions and provenance: `docs/marketing/expense-depreciation-slide.md`.

- Pension overview and deduction/credit artwork are main slides 11–12, after the study comparison (16 main/28 total). Both use the existing contain renderer and exact approved PNGs; no calculation changes. `docs/marketing/pension-slides.md` records provenance and presenter qualifications removed from the visible artwork at user request.

- Study comparison example is capped at 20,000 annual deposit in both slider and model, with fixed annual business taxable income 250,000 (maximum deduction 11,250). These teaching choices are separate from the statutory 2026 gains exemption ceiling 20,566; income is no longer editable in the assumptions panel.

- Study comparison now repeats the selected deposit at the start of every year. Total principal = annual deposit × years; each deposit compounds for its own holding period. Card shows annual deduction saving, yellow summary shows cumulative saving (not reinvested). Income/rates/2026 ceilings held constant explicitly. This supersedes the single-deposit model below.

- Study-fund comparison is main slide 10, immediately after study-fund teaching (14 main/26 total). `guide-study-comparison.component.*` overlays live controls/results on approved artwork; the persistent component preserves inputs across navigation. `guide-study-comparison.ts` isolates capped 2026 deductions and gains exemption. Same single deposit/return, terminal liquidation, no reinvestment of current tax savings. Income assumption is editable; limitations and provenance are in `docs/marketing/study-fund-slide.md`.

- Study-fund slide added 2026-10-02 as main slide 9, after the authorities hub and before expenses: approved image with subtitle and top/bottom notes removed. Now 13 main/25 total screens; chapter sequences and return hub unchanged. See `docs/marketing/study-fund-slide.md` for provenance and presenter caveats.

- Solution artwork updated 2026-10-02 from approved `exec-6356ab9b-6f38-4172-90dc-b5a5d66bc582.png`: aligned headings, separate bank/card and document inputs converging on a matching brain, WhatsApp marked forthcoming, and the approved year-end caption. Same lossless asset replacement/contain renderer; accessible copy updated. Provenance and claim boundaries in `docs/marketing/product-introduction-slides.md`.

- Pain-slide quality replacement: latest approved source is `exec-a401c3db-607a-443d-ace3-fffe81d1edbb.png`, rebuilt from the sharp original and then edited only for smaller detached arrows. Supersedes the earlier multi-edit image below; same asset path and contain renderer, no code changes.

- Product-pain artwork updated 2026-09-29 to approved `exec-d1248bbb-745e-4d6f-a285-f8095224bf39.png`, copied losslessly to the existing asset path. Forgotten yellow sheet on floor, missed sheet outside accountant folder, separated stages and detached arrows. Native contain renderer unchanged; provenance in `docs/marketing/product-introduction-slides.md`.

- Expense custom-entry update: inline “הוסף הוצאה” form retains amount and separate tax/VAT recognition percentages per item, accumulating the slider total. Slider changes scale item amounts proportionally without losing recognition rates. VAT is disabled for exempt dealers and now also appears in the middle receipt. Calculator eyebrow/footer caveats were removed at user request; assumptions remain in `docs/marketing/expense-savings-slides.md`. Focused validation covers entry, cancel, invalid input, mixed recognition and scaling.

- Expense calculator follow-up: no revenue input or before/after profit display; applies chosen marginal rates to the full recognized expense under an explicit sufficient-taxable-profit assumption. VAT remains separate; removed net-cost display and turnover warning. Title: `כמה ההוצאה הזאת באמת שווה לכם?`. This supersedes the income cap described in the initial entry below.

- Expense teaching slides (2026-09-25): `expense-principle` then `expense-savings` precede product pain in the main sequence, now 12 main/24 total screens. `guide-expense-savings.component.*` provides a native visual explanation and a persistent live calculator; `guide-expense-savings.ts` is an isolated linear estimate, not the tax/NI assessment engine. VAT is removed from deductible costs before applying user-selected rates; zero liabilities and expenses above revenue are guarded. Regular exempt/authorized routes only; micro-route exclusion and model limitations are visible. Details/sources: `docs/marketing/expense-savings-slides.md`. Earlier screen counts below are historical.

- Product-slide integration: main slides 9 and 10 are `product-pain` and `product-solution`, the exact latest artwork from task `שקופיות להצגת אפליקציית KeepInTax`. There are now 22 distinct slides (10 main, 7 income, 2 VAT, 3 NI). The authorities hub remains main slide 8 and chapter returns still land there; its Next button continues to the product slides. Sources and approved copy: `docs/marketing/product-introduction-slides.md`. These counts supersede historical entries below.

- Guide now has 20 distinct screens: the duplicate `income-tax-summary` calculator entry was removed. `tax-simulator` appears once, last in the 7-screen Income Tax chapter after `micro-reporting`; Next returns to the authorities hub. The earlier 21/16-screen counts below are historical.

- Slide 7 contact refinement: source `exec-a9c6a765-bfd5-4013-ae12-8c2f8a8ea916.png` is the latest `micro-blockers-approved.png`. Built-in precise-object-edit adjusted Kipi's foot placement, sign top edge, contact shading and shovel angle for physical integration. Small size, overalls, hat and all text are retained.

- Slide 7 Kipi follow-up: reduced size about 20%, blue bib overalls, khaki hat and handheld digging shovel, still standing on the kibbutz sign. Latest source `exec-5665afbb-f6ed-40f9-af46-aadd5ddcea9b.png` replaces the same `micro-blockers-approved.png` asset. Built-in precise-object-edit prompt changed only Kipi's size, outfit and shovel; slide text/layout remain unchanged.

- Main slide 7 (`micro-blockers`) artwork uses three readable lines `חלק מההכנסה / מגיע / מהמעסיק`. Kipi stands on the kibbutz-member sign in a khaki hat and blue work clothes, with all other content preserved. Built-in image-edit source: `exec-1a6168da-fdc8-4710-a0bb-d0c688bfb4e7.png`; saved as `frontend/src/assets/self-employed-guide/micro-blockers-approved.png`. Prompt scope: fix that caption and add reference-matched Kipi only, leaving headings, five signs, person, logo and footer intact.

- Status-comparison artwork revision: `exec-ff3d4736-2109-4e27-8dba-44ee02c36574.png`, built-in image edit. Prompt scope: new eligibility heading and five right-side check icons/right-aligned rows, then remove the scientist and her magnifying glass and restore the office background; retain eligibility copy and 2026 figures. Saved as `frontend/src/assets/self-employed-guide/status-comparison-approved.png`.

- Main slide 5 micro-business annual-report text includes `(ניכוי 30% הוצאות)` in the artwork and content description. No calculation or eligibility changes.

- Main slide 6 (`status-comparison`) title is `מי יכול להיות פטור, ומי זעיר?`. Its five checklist rows use right-side check icons and right-aligned text; eligibility copy and figures are unchanged.

- Obligations-folder items use RTL layout: icons on the right of right-aligned text, in all three folders.

- Main slide 5 (`income-tax-overview`) is `החובות של כל עסק`, with Kipi and obligations grouped by authority. Exempt VAT declaration is annual, authorized VAT reporting periodic, micro VAT obligations follow its VAT classification; NI reporting/payment depends on status and income. Evidence and artwork provenance: `docs/marketing/business-obligations-slide.md`.

- Guide navigation is eight main slides (cover, glossary, employee, business types, income overview, status comparison, micro blockers, authorities) plus isolated Income Tax (7), VAT (2), and NI (3) chapters. Counters/progress are chapter-local. Previous is disabled on the first slide; Next on the final chapter slide and the explicit return control return to main slide 8. Escape outside fullscreen returns from a chapter. Simulators stay mounted. Earlier linear-navigation descriptions below are superseded by this flow.

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

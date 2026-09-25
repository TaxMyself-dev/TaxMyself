# Expense recognition: principle and interactive savings

2026-09-25. User requested two slides immediately before the product pain slide:
one visual principle, followed by a lively calculator with business type, marginal
income-tax rate, insurance rate and expenses. Follow-up: removed revenue input,
before/after profit and net-cost display; title is now “כמה ההוצאה הזאת באמת שווה לכם?”.

## Presentation

Main IDs `expense-principle`, `expense-savings` are slides 9/10; product pain and
solution become 11/12. Authorities hub remains 8. Total distinct screens: 24.
Native HTML/CSS, mint/lime/navy, receipt illustration, lower-profit bars, separate
VAT lane, large savings result. No new image generation or customer data.
Calculator remains mounted while hidden, preserving inputs across navigation.

## Model and boundaries

### Custom-expense update (supersedes the fixed-add behavior below)

The calculator eyebrow and both explanatory footer lines were removed at the
user's request; assumptions remain documented here. The result still says estimated
savings, and the route remains regular/marginal-rate teaching only.
“הוסף הוצאה” opens an inline form for gross amount, tax recognition (0–100%) and
VAT recognition (0–100% of VAT, not of gross). VAT recognition is disabled for
exempt dealers. Zero VAT recognition supports expenses without eligible VAT.
Each item retains its own rates. Recoverable VAT = amount * 18/118 * VAT recognition;
recognized expense = (amount - recoverable VAT) * tax recognition. Tax and NI rates
apply to recognized expense. The receipt now includes the VAT savings row.
New items accumulate into the slider total (maximum 100,000); moving the slider
scales all current item amounts proportionally, preserving recognition rates.
Cancel leaves totals untouched; invalid amounts/percentages are rejected. The
initial 11,800 example has 100% recognition. Model limitations listed below still
apply: this is not a category-specific tax assessment.
Verification for this update is limited to the expense calculator suites and a
browser form submission/slider check, per the user's request for targeted checks.
Result: 10 expense-only tests passed; browser submission of 1,180 at 50%/50%
recognition increased the slider from 11,800 to 12,980 and showed 297 rounded
additional savings. No full guide suite or production build was rerun for this edit.

This is a linear teaching estimate, NOT the existing tax or NI assessment model.
Supports exempt and authorized dealers under the regular actual-expense route.
Micro-business 30% normative deduction is explained on the principle slide and
explicitly excluded from the calculator. Company taxation is outside its scope.

- Expense amount is cash paid, including VAT if applicable. No revenue input.
- Assumes all expenses are immediately and fully deductible. No mixed-use,
  partial recognition, depreciation or category-specific percentages.
- Authorized + eligible checkbox: recoverable input VAT = gross * 18 / 118.
  Otherwise recoverable VAT = 0. Checkbox assumes valid invoice, full input VAT
  eligibility and taxable business use. It does not validate invoices.
- Deductible expense = gross expense minus recoverable VAT (never count twice).
- Reduction = deductible expense. Explicit assumption: sufficient taxable profit
  and the selected marginal rates apply to the entire recognized expense.
- Tax saving = reduction * manually selected marginal rate / 100 (0–50).
- NI/health saving = reduction * manually selected combined rate / 100 (0–18).
- Total = tax saving + NI/health saving + VAT credit; net cost = gross - total.
- No progressive brackets, personal credits, NI minimum/cap, 52% NI adjustment,
  salary interactions, pension or loss carry-forward. The tool does not promise
  immediate cash refunds and no longer checks turnover or profit limits.
- Additional-expense button adds 1,180 gross (bounded to 100,000) and reports the
  difference in modelled savings under the stated sufficient-profit assumption.
  Changing parameters clears that stale delta.

Example: authorized, eligible gross expense 1,180, positive profit at least 1,000,
20% tax and 18% NI/health => 180 VAT, 200 tax, 180 NI/health; estimated 560 benefit,
620 net cost. These are deliberately simplified teaching numbers, not a tax quote.

## Official evidence checked 2026-09-25

- https://www.gov.il/he/service/reporting-or-payment-of-vat-reports — output VAT
  less eligible input VAT, separate from profit-based taxes.
- https://www.gov.il/he/service/verify-vendor-invoice-information — eligible invoice
  and allocation-number requirements; not all expenditure yields input VAT.
- https://www.gov.il/he/service/report-and-payment-for-micro-business-owner — fixed
  30% turnover deduction, not additional actual-expense deductions.
- https://www.gov.il/BlobFolder/policy/inst-07-2025/he/IncomeTax_inst-07-2025.pdf
- https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/rates.aspx
  — actual rates and minima vary; selected percentages are illustrative.
- https://www.btl.gov.il/Laws1/00_0103_000000.pdf — tax/NI deduction interaction,
  excluded explicitly from this simple illustration.

## Checks

Focused guide/simulator suites include pure calculation edge cases and real DOM
input/button tests. Browser checks cover screenshots, slider interactions, adding
an expense, persistence after navigation and the sequence before product slides.

Verification: 36 focused tests pass; optimized dev build passes with existing
bundle/CommonJS warnings and a non-blocking new component style-size warning.
Visual review at 1440px and 600px verifies loaded icons and no calculator overflow
(600px-wide slide: clientHeight and scrollHeight both 338px). Browser-only temporary
bootstrap and screenshot/build output are excluded from the commit.

# Pension slides — approved implementation, 2026-10-02

Main slides 11–12 follow study-fund comparison and precede expense teaching.
There are 16 main screens and 28 unique screens; authority chapters are unchanged.

## Approved artwork

- `pension-approved.png`: source `exec-6b35d8b7-7c33-41a4-9da8-76d94c7f7e76.png`.
  Four topics: mandatory contributions where applicable, tax benefits, disability
  and survivor coverage subject to fund terms, and retirement pension.
- `pension-tax-benefits-approved.png`: source `exec-d7a1f127-66fd-4595-9b28-1c76ed4fdc5e.png`.
  Final approved revision removes both bottom explanations. Credit panel shows
  tax due 10,000 minus credit 350 equals 9,650, and explicitly states that without
  tax liability there is nothing to offset. Deduction example reduces taxable
  income 250,000 to 249,000, saving 310 at an assumed marginal rate of 31%.

Sources are PNGs in the conversation's generated-images directory, copied byte
for byte to `frontend/src/assets/self-employed-guide/`. Use existing contain
rendering, without cropping, regeneration, or extra visible text. Alt text is
provided in the content model. No tax engine or calculator is modified.

## Presenter qualifications (not extra slide copy)

Examples assume recognized deposits, sufficient tax liability, applicable
eligibility and annual ceilings. Deduction and credit apply to separate allocated
parts: the same shekel cannot receive both. The 1,000 examples are illustrations,
not a complete personal annual calculation or a promise of a refund. Tax already
withheld can be refunded when annual liability is reduced; zero outstanding
balance after prepayments does not mean zero annual tax liability.

The 31% example assumes the full deductible portion is in that band. Actual
benefits depend on income, salaried contributions and other deductions/credits.
Insurance coverage depends on pension fund terms and chosen coverage, not merely
on having any pension savings product.

Evidence used in planning: Kol Zchut, “הטבות במס הכנסה בגין הפקדות עצמאיות
לביטוח פנסיוני”, and published 2026 contribution limits from Altshuler Shaham.
This implementation only transcribes approved artwork; it adds no new tax rates.

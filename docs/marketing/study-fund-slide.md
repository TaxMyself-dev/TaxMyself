# Self-employed study fund slide

Approved for implementation 2026-10-02. Main slide 9, after the authorities hub
and before expense teaching slides; existing chapter routes remain unchanged.

Asset: `frontend/src/assets/self-employed-guide/study-fund-approved.png`.
Built-in image edit source: `exec-5a0e8ed8-c15a-4b94-bab9-3c5b1b18fc7e.png`.
Final prompt: remove only the subtitle, preserving all other artwork and text.
Copied without resizing or recompression, rendered with the existing contain layout.

User requested removal of the optional-saving pill, both bottom note rows, and
the subtitle. Preserve the three explanations: recognized deposits reduce taxable
income; qualifying gains are exempt up to the applicable deposit ceiling; after
six years the funds can be withdrawn for any purpose or left invested.

Presenter context (not added back to the artwork): deductions and exempt gains
have different limits and conditions. This is voluntary saving, returns are not
guaranteed, and special early-withdrawal rules are outside this overview.
No year-specific figures or calculator logic are introduced.

Evidence used for content planning: Ministry of Finance study-fund review,
https://www.gov.il/BlobFolder/dynamiccollectorresultitem/review-15102025/he/reviews-and-publishes_review-15102025.pdf

The pension slide remains pending design and approval; it is not implemented.

## Interactive comparison (2026-10-02)

### Annual-deposit update (supersedes single-deposit description below)

User changed the input to an annual deposit repeated at the beginning of every
year. Principal is deposit × years. Balance recurrence is (balance + deposit)
× (1 + return), once per year. Annual limits apply separately each year, with
constant income, marginal rate and 2026 ceilings as illustration assumptions,
not a prediction of future law. Same account, no intermediate withdrawals.
Cards show annual tax saving; yellow summary shows saving × years, undiscounted
and not reinvested. Total deposits are shown below sliders. At 10,000/year,
6 years, 5%, 31%: principal 60,000; annual tax saving 3,100; cumulative 18,600;
fund balance 71,420; trading balance 68,565; gains-tax saving 2,855 (rounded).
Verification: 3 spec cases / 14 assertions passed via a direct TS-transpilation
harness; browser verified annual label, default amounts and 10-year slider update.

Main slide 10 follows the study-fund overview. Now 14 main/26 total slides.
Approved corrected-Kipi artwork `exec-956b7e46-a3bc-4f20-9548-6c0a1080193a.png`
is copied without recompression to `study-fund-comparison-approved.png`.
Native overlays mask static numbers and controls while keeping approved artwork.
State stays mounted across navigation; no APIs or customer data.

Single deposit 0–100,000, marginal tax 0–47%, 6–30 years, assumed growth 0–10%.
Default 10,000 / 31% / 6 / 5%, business profit 250,000 editable in assumptions.
2026 deductible = min(deposit, 13,203, 4.5% * min(profit,293,397)).
Capital-gains exempt deposit limit 20,566; proportional gains on excess taxed
at 25%. Trading account gains taxed at 25% on final liquidation. Zero inflation,
fees, interim sales/dividends, surtax or NI savings. No other deposits this year
or salaried study fund. Deduction assumed within one marginal bracket with
sufficient tax liability. No reinvestment of current tax savings. Not personal
tax advice or a return guarantee. No provident-fund comparison.

Ceiling reference: https://www.analyst.co.il/depositing-celings/
Focused checks: 11 direct model assertions passed; browser checks passed for
default results, slider changes, income assumption, retained state and rendering.
Jasmine regression cases added; full Karma suite not rerun.

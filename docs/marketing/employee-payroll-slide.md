# Employee payroll slide

Approved for implementation on 2026-09-19 after the glossary, as screen 3.
Title: המעסיק מטפל בהכל.

2026-09-22: User-requested headline-only edit using built-in image generation,
source `exec-158c1c37-2f55-4760-ae0c-63dad0903313.png`. All other artwork and
presenter caveats below remain unchanged. This supersedes the original image
source/hash and no-regeneration instruction below.

- Final source: `exec-4a09a7ee-c53e-42cc-bc83-794915e47671.png` in
  `C:/Users/harel/.codex/generated_images/01a08785-cca4-74b2-9059-1b7aae1008bc`.
- Copy unchanged to `frontend/src/assets/self-employed-guide/employee-payroll-approved.png`.
- Serious employer; pleased employee looking down at his laptop. Laptop text
  reads נטו 12,573 ₪, fully inside the lid, not overlapping the trousers.
- Retirement countdown board reads סופרים עד הפנסיה and גיל 67.
- Four headings only: מס הכנסה, ביטוח לאומי, פנסיה, קרן השתלמות.
- No employer label/paragraph on the desk, panel sublines, or bottom reminder.
- Use existing contain artwork rendering. No new overlays or regenerated image.
- 21 screens. Keep stable-ID authority navigation and both calculators unchanged.

## Presenter context (not extra slide copy)

12,573 is a fictional illustrative net salary, not a calculated result. The
retirement board is a joke about the pictured male employee. Study-fund
entitlement depends on the applicable employment arrangement; it is not universal.
The employer handles remittances, which may include employee deductions, not
necessarily funds paid solely by the employer. The slide is an introductory
illustration, not a claim that employees have no obligations.

Sources checked during design:
- [National Insurance employer duties](https://www.btl.gov.il/Insurance/Maasik/Pages/default.aspx)
- [Ministry of Labour pension insurance](https://www.gov.il/he/pages/pension-insurance?chapterIndex=5)
- [Study fund entitlement](https://www.kolzchut.org.il/he/קרן_השתלמות)

## Local verification

- Source/copied asset SHA256 match: 8125B927385241CCDFC60BC5BA8A1D238DB4D5ECE05D395D72CDB8E13BF84D1C.
- Focused Angular suite: 23 passed, exit 0.
- Angular production build: passed, hash 169e5f89f25d4c57, 155.505s.
  Existing unrelated bundle/style-budget and CommonJS warnings remain.
- Browser: all 21 screens decode, exact artwork at position 3, contain sizing,
  previous/next, VAT hotspot, fullscreen and compact viewport pass; no page errors.
- Separate local follow-up; not pushed. Temporary preview bootstrap and QA
  artifacts excluded from commit. No backend or calculation changes.

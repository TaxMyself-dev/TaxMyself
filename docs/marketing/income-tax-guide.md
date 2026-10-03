# Income Tax guide — approved content and artwork

## 2026-10-03 consolidated advances guidance

Removed `advances-adjustment` from the slide model and chapter navigation.
Income chapter is now six screens; main sequence remains 17, total 28.
Slide 3 now includes “שינוי מהותי בעסק? אפשר לבקש עדכון מקדמות במהלך השנה.”
Latest built-in image edit source: `exec-f31ac210-1acc-4591-8149-79b96d16529f.png`,
copied without recompression to `advances-calculation-approved.png`. Prompt scope:
add only the single sentence in the gap above the bottom banner, preserve all
other artwork. Previous adjustment PNG retained as an unused historical asset.
This is a request to update advances, not permission to change payment unilaterally.
Example remains based on turnover excluding VAT. No calculation engine changes.

## 2026-10-03 advances caption removal

Income chapter slide 3 (`advances-calculation`): removed only the small line
“המספרים להמחשה בלבד · מחזור ללא מע״מ” at the user's request. Built-in image
edit source `exec-d954f592-8d7b-42e2-b060-a7004d65f195.png` replaces
`advances-calculation-approved.png` without recompression. All other copy,
20,000 × 5% = 1,000 example and renderer remain unchanged. The underlying
example still assumes turnover excluding VAT; removal is visual, not a change
to advance-payment calculation rules. No calculation code changes.

Approved by Elazar in the marketing conversation, 2026-09-14. Implementation
continuation of KT-021. No VAT chapter, customer data or publication is included.

## Locked decisions

- Preserve the approved cover and introductory screens.
- Five new slides have no human character and use the exact final approved artwork.
- Short Hebrew copy; navy/mint/lime palette. Payment uses a desktop journey;
  the micro-business slide uses an open planner.
- Advances may be a percentage of turnover or an amount. The 20,000 × 5%
  example is explicitly a percentage example, not a universal rule.
- No separate year-end example slide: revisit the existing live simulator
  after the five new slides, retaining entered values.
- Annual settlement deducts salary withholding, advances and customer
  withholding once each. Tax brackets are unchanged.
- VAT is the next planning phase, not included in this implementation.

## Approved additions after the original simulator

| Screen | Title | Asset | Original generated reference |
| --- | --- | --- | --- |
| 9 | מה זה בעצם מקדמות? | advances-introduction-approved.png | exec-1add7481-8d9e-448e-8de6-5cfd566a28a1.png |
| 10 | איך נקבעות המקדמות? | advances-calculation-approved.png | exec-d72758b5-ac94-44a7-8c63-06d68bf69627.png |
| 11 | העסק השתנה? בודקים גם את המקדמות | advances-adjustment-approved.png | exec-b4f9b8af-fddf-4a82-8542-48de9af8a462.png |
| 12 | איך מדווחים ומשלמים את המקדמות? | advances-payment-approved.png | exec-7858fdc7-28a3-46b7-8019-b11594f06559.png |
| 13 | עסק זעיר? יש מסלול מקוצר | micro-reporting-approved.png | exec-c5939aa2-207a-4234-a06f-770da11477d5.png |
| 14 | חשבון לכיתה ד - אין מה לחשוש | Existing live simulator | Same instance as screen 8 |

Runtime assets are in `frontend/src/assets/self-employed-guide/`. Original
generation filenames are provenance, not runtime paths. Static wording is baked
into approved images; future changes require an approved replacement or precise
overlay, never an approximate reconstruction. Semantic descriptions and official
sources are stored in `self-employed-guide.content.ts`.

## Official evidence

- [Advance reporting/payment](https://www.gov.il/he/service/itc-payment-online-incometax)
- [Percentage and amount methods](https://www.gov.il/files/taxes/KnowYourRights2018/files/basic-html/page179.html)
- [Advance adjustment](https://www.gov.il/he/service/itc-2216a)
- [Micro-business report](https://www.gov.il/he/service/report-and-payment-for-micro-business-owner)
- [Optional micro-business advances](https://www.gov.il/he/service/request-down-payment-for-micro-business-owner)

No changing deadlines are embedded. Examples are illustrative, not personal
advice. The simulator is a simplified regular-route illustration, not a full
annual return or a micro-business eligibility calculator.

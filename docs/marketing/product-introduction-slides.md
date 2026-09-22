# Product introduction slides

Integrated on 2026-09-22 at the user's request from task
`שקופיות להצגת אפליקציית KeepInTax` (`01a0c65d-9a0b-7bc0-9500-1d11c1b22ea5`).

## Artwork and placement

- Main slide 9, `product-pain`: `הסיוט של כל עצמאי`.
  Source `exec-181fa313-b032-4fae-8a50-a98be4f18f6f.png` copied unchanged to
  `frontend/src/assets/self-employed-guide/product-pain-approved.png`.
- Main slide 10, `product-solution`: `הפתרון של KeepInTax`.
  Source `exec-4e8ff287-6fed-4a5c-8f22-c3db51e8ddd5.png` copied unchanged to
  `frontend/src/assets/self-employed-guide/product-solution-approved.png`.

Both use the existing contain-based approved-artwork renderer; no regeneration,
cropping, new overlays or customer data. Accessible Hebrew copy is in the content
model. The tax-authorities hub stays at main slide 8; chapter completion returns
there, and Next from the hub continues to these slides. Previous works in reverse.

## Locked message

Pain: collecting documents without knowing what was forgotten; sending them to
the accountant without knowing what was included; year-end debt when profit rose
without adjusted advances. This is a pain scenario, not a claim that every business
necessarily owes tax at year-end.

Solution: bank/card connection, shared owner/accountant report status, and
`מעקב אוטומטי אחרי הרווח השנתי`. The separate task explicitly found no implemented
automatic status-change or advance-adjustment alert; that claim was removed before
the user approved generating this solution artwork. Do not add such an alert claim.

# VAT and National Insurance guide — approved implementation, 2026-09-18

## Locked decisions
- Append to the existing 14-screen Income Tax guide; total 19 screens.
- Static slides use the exact approved artwork, contained without crop.
- No characters or promotional National Insurance introduction.
- Two VAT screens: overview, then 1800 minus 360 equals 1440 example.
- NI status screen: three alternative inclusive tests, 2026 figures.
- NI payment screen: final single-line phrase, removed examples/yellow banner,
  removed "גם עוסק פטור יכול להיות חייב"; no independent redesign.
- Interactive screen: right inputs, middle derived status/breakdown, left additional
  monthly payment. Profit/salary/hours derive status, not an arbitrary status switch.
- Values survive slide navigation; input arrows must not navigate the viewer.
- No backend, annual.params.json, customer records or production impact.
- Further NI rights and advance-payment slides have NOT been designed/implemented.

## Artwork provenance
Generated-image directory: C:/Users/harel/.codex/generated_images/01a08785-cca4-74b2-9059-1b7aae1008bc
- vat-introduction-approved.png: exec-776d7183-0013-4f24-9a86-c14a1bb49d27.png
- vat-calculation-approved.png: exec-b01e8912-9f79-447c-8884-1ab112dbc465.png
- ni-status-approved.png: exec-8ce63c97-e2c6-446e-b95b-e31c2d22b6d9.png
- ni-payment-approved.png: exec-0c18432f-a9b7-4137-bf29-4891dc15b9ee.png
- Calculator reference: exec-fdeb7a29-7e3b-40da-921f-cdc0fdaa7c5c.png.
  Implemented as native HTML controls rather than a bitmap; dynamic states add
  necessary calculation explanations and explicit educational scope.

## Calculator scope and rules
Monthly-average educational estimate, ages 18 to retirement, regular self-employed
route, no other income, special exemptions, pension deductions or micro-business
specific calculation. Year constants are isolated in guide-national-insurance.ts.
No real customer data, API calls, backend writes or persistence outside component.

- Status is based on business profit and weekly hours: >=20h OR >=6885 NIS OR
  (>=12h AND >=2065 NIS). Salary does not determine status.
- Qualifying: 7.7% / 18% including health; reduced band 7703; combined cap 51910.
  Salary uses bands/cap first. Solve x + .52 * NI(x) = profit (NI only, not health).
  Apply self-only minimum base 3442; no independent minimum when also salaried.
- Nonqualifying: subtract exemption 3442 from business income, never from salary.
  Rates 12.09% / 12.17%; use remaining salary bands/cap. Without salary, total is
  at least 266, displayed as personal minimum rather than falsely a tax on profit.
- Display rounds to whole shekels, internal monetary result to agorot.
- Salary contributions are not included in additional-payment result.
- UI money controls: slider-only 1000–50000 NIS, step 100, noneditable formatted
  outputs (user revision 2026-09-18). Hours retain number input and 0–80 slider.
  The underlying calculation still supports zero/no-salary and up to 100000 for
  boundary tests; these scenarios are no longer selectable through the current UI.
- Static numerical artwork is fixed for 2026: future year changes require updating
  artwork as well as constants; do not silently use a new year with old images.

## Official evidence checked 2026-09-18
- [Definition](https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/default.aspx)
- [Self-employed rates and minimum](https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/rates.aspx)
- [NI-only 52% adjustment and worked example](https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/hishov.dmey.bituach.aspx)
- [Nonwork income exemption, rates and minimum](https://www.btl.gov.il/Insurance/Rates/Pages/מי%20שאינם%20עובדים%20ובעלי%20הכנסה%20שלא%20מעבודה.aspx)
- [Salary and business](https://www.btl.gov.il/Insurance/National%20Insurance/type_list/עובד%20שכיר%20וגם%20עובד%20עצמאי/Pages/default.aspx)
- [VAT reporting](https://www.gov.il/he/service/reporting-or-payment-of-vat-reports)

## Verification
- Focused Karma/ChromeHeadless: 21/21 passed, including actual Angular input and
  navigation persistence integration test plus 224 calculation combinations.
- Production build passed, hash fb5f0571dedf9c34, 81.218s; unrelated existing
  component-style, initial bundle and CommonJS warnings. Preview bootstrap present.
- Local Playwright/Chrome review: all 19 slides/images loaded, state updates,
  minimum, protected input arrows, persistence, fullscreen, compact viewport and
  VAT hotspot passed; no page errors. Screenshots inspected for default,
  qualifying and minimum/compact states. Native CUA failed before connecting;
  bundled Playwright was used without installing dependencies.
- Local preview bootstrap remains excluded from commit. No integration into main.
- Final production rebuild after slider polish: cd09b4df26ef1de4, 33.366s,
  passed with the same pre-existing warnings; browser checks rerun successfully.
- Slider-only range revision: 22/22 focused tests passed; production build
  0029589ed889b160 passed in 48.743s with existing unrelated warnings.

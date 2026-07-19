# מיפוי מצב קיים — עמוד "הוצאות ממתינות לאישור" (Report Review)

תיעוד בלבד — נכתב לפני שינויי עיצוב/פיצ'רים בעמוד. אין בקובץ הזה שינויי קוד.
כל הממצאים נקראו בפועל מהקוד (לא הונחו משם קבצים).

## הערת מינוח חשובה

הביטוי המדויק "הוצאות ממתינות לאישור" **לא מופיע** בשום מקום ב-frontend. כותרת העמוד
בפועל היא **"סקירה לפני הצגת הדוח"** ([report-review.page.html:3](../frontend/src/app/pages/report-review/report-review.page.html#L3)).
שם הקומפוננטה/המודול בקוד הוא **Report Review**.

⚠️ **יש מסך שלישי עם ניסוח כמעט זהה שהוא concept שונה לגמרי**: בפאנל הרו"ח
(`clients-panel`) יש כותרת טבלה שהיא ממש **"הוצאות ממתינות"**
([clients-panel.page.html:621](../frontend/src/app/pages/clients-panel/clients-panel.page.html#L621)),
אבל זה **לא** אישור הוצאות בודדות — זה תור של מיפויי תת-קטגוריה שממתינים לאישור רו"ח
(`ApprovalStatus.PENDING_ACCOUNTANT_APPROVAL`, "ממתינה לאישור"), עם ספירת הוצאות חסומות
לכל שורה. יש לוודא מול הצוות שאין בלבול בין שני המסכים לפני שמתחילים לתכנן שינויים.

---

## 1. רשימת קבצים

### Frontend

| קובץ | תפקיד |
|---|---|
| [report-review.page.ts](../frontend/src/app/pages/report-review/report-review.page.ts) (~2291 שורות) | הקומפוננטה הראשית. state מלא (Angular signals), מיפוי `ReviewRow`→`EditableReviewRow`, כל לוגיקת העריכה/בחירה/אישור/bulk |
| [report-review.page.html](../frontend/src/app/pages/report-review/report-review.page.html) | תבנית — טבלה גנרית (`GenericTableComponent`) + תאי `ng-template` לכל עמודה ניתנת לעריכה + פאנל תצוגה מקדימה של Drive + דיאלוגים משניים |
| [report-review.page.scss](../frontend/src/app/pages/report-review/report-review.page.scss) | עיצוב, כולל צבעי badge וצבעי סוג-שורה |
| [report-review.module.ts](../frontend/src/app/pages/report-review/report-review.module.ts) / [report-review-routing.module.ts](../frontend/src/app/pages/report-review/report-review-routing.module.ts) | חיווט מודול Angular, ראוט יחיד ריק (`/report-review`), guards `AuthGuard, BillingGuard` |
| [services/report-review.service.ts](../frontend/src/app/services/report-review.service.ts) | כל קריאות ה-HTTP לבקאנד — types מקבילים ל-DTO של הבקאנד |

**flow-report** ([frontend/src/app/pages/flow-report/](../frontend/src/app/pages/flow-report/)) — עמוד **נפרד ומקביל**, לא אותו עמוד. ראו סעיף 4 (קוד ישן/legacy כנראה).

### Backend

| קובץ | תפקיד |
|---|---|
| [report-review.service.ts](../backend/src/reports/report-review.service.ts) (~1400 שורות) | הליבה: `getReportPreview` (בניית השורות), 3 פונקציות `approve*`, `linkDocToTx`, `archiveDoc`/`deleteDoc`, `unpair`, `rejectTx`, `uploadDocAndLinkToTx`, D8 triage (`fileDocAsAnnual`/`setDocKind`) |
| [dtos/report-review.dto.ts](../backend/src/reports/dtos/report-review.dto.ts) | טיפוסי ה-wire: `ReviewRow` (union), `ReviewClassification`, `ReportPreviewResponse` |
| [reports.controller.ts](../backend/src/reports/reports.controller.ts) | 14 endpoints תחת `/reports/me/...` |
| [matching.service.ts](../backend/src/reports/matching.service.ts) | האלגוריתם שמצמיד מסמך↔תנועה אוטומטית (±3 ימים, ±1 ₪) |
| [document-pairing.service.ts](../backend/src/documents/document-pairing.service.ts) | מצמיד חשבונית↔קבלה מאותה רכישה (לפני ה-matching) |
| [expenses.service.ts](../backend/src/expenses/expenses.service.ts) (`addExpense`) | היעד הסופי — יוצר `Expense` + רשומת יומן (journal entry), כולל בדיקת כפילויות |
| [extracted-document.entity.ts](../backend/src/documents/extracted-document.entity.ts) | ישות `ExtractedDocument` — תוצאת ה-OCR |
| [slim-transaction.entity.ts](../backend/src/transactions/slim-transaction.entity.ts) | ישות `SlimTransaction` — תנועת בנק מסווגת |
| [expenses.entity.ts](../backend/src/expenses/expenses.entity.ts) | ישות `Expense` — היעד הסופי |
| [catalog.service.ts](../backend/src/bookkeeping/catalog.service.ts) / [catalog-context.service.ts](../backend/src/bookkeeping/catalog-context.service.ts) | פתרון הקטלוג הממוזג (CLIENT>ACCOUNTANT>SYSTEM) — משמש הן לתצוגה המקדימה והן לאישור בפועל |

---

## 2. מיפוי הפלואו הלוגי

```
upload→Drive inbox/  ─┐                    Open Banking sync ─┐
                       │                                       │
                  OCR (Claude)                          classify (rule/manual)
                       │                                       │
              ExtractedDocument                        SlimTransaction
              status=PENDING_REVIEW                  isRecognized=true, confirmed=false
                       │                                       │
                       └──── DocumentPairingService ───────────┤   (חשבונית↔קבלה, לפני matching)
                       │                                       │
                       └──────── MatchingService ───────────────┘   (±3d / ±1₪, first-fit)
                                        │
                         GET/POST /reports/me/preview
                                        │
                    ┌───────────────────┼───────────────────┐
              matched row          doc_only row          tx_only row
           (מסמך + תנועה)         (מסמך בלבד)          (תנועה בלבד, רק אם יש Open Banking)
                    │                   │                     │
              approve-matched     approve-doc-cash      approve-tx-no-doc
                    └───────────────────┴─────────────────────┘
                                        │
                         ExpensesService.addExpense (טרנזקציית DB אחת)
                          → Expense נוצר + JournalEntry+JournalLine נפוסטים
                          → ExtractedDocument.status = APPROVED
                          → SlimTransaction.confirmed = true
```

### אישור (approve)

לכל אחד מ-3 סוגי השורה יש endpoint נפרד שכולם עוטפים `ExpensesService.addExpense`
**באותה טרנזקציית DB**:

- **matched**: לוקח ערכים מה-document קודם, נופל חזרה ל-slim; מקושר לשני המקורות
  (`sourceDocumentId` + `externalTransactionId`)
- **doc_only**: קבלה/מסמך מזומן, אין תנועה
- **tx_only**: אין בורר סיווג בעריכה — לוקח את הקטגוריה שכבר נקבעה בזמן הסיווג של התנועה

### דחייה/מחיקה

- `archiveDoc` (סטטוס `ARCHIVED` — "זה מסמך אמיתי, לא תובע עכשיו")
- `deleteDoc` (סטטוס `REJECTED` — "זה לא באמת מסמך הוצאה")

שני המצבים הם soft-delete. עבור tx_only: `rejectTx` מאפס `isRecognized=false`
(ללא נעילת תקופת דיווח — ראו הערה בסעיף 4).

### מזהה מקור (source/origin)

אין שדה `source` בודד — הזיהוי מבני, לא שם עמודה יחיד:

| שדה | ישות | משמעות |
|---|---|---|
| `matchedTransactionId` | `ExtractedDocument` | מצביע ל-`slim_transactions.id` כשהמסמך הותאם לתנועה. NULL = doc-only |
| `matchStatus: 'matched' \| 'manual_link' \| null` | `ExtractedDocument` | האם ההתאמה הייתה אוטומטית או ידנית |
| `matchedDocumentId` | `SlimTransaction` | מצביע חזרה ל-`extracted_document.id`. NULL = tx-only |
| `sourceDocumentId` | `Expense` | לאחר אישור — מאיזה `ExtractedDocument` ההוצאה נוצרה |
| `externalTransactionId` | `Expense` | לאחר אישור — מאיזו תנועת בנק ההוצאה נוצרה. יכול להיות מלא **יחד עם** `sourceDocumentId` בשורת matched — "הוצאה אחת, שני מצביעי מקור" |
| `ReviewRow.type: 'matched' \| 'doc_only' \| 'tx_only'` | DTO (wire only, לא נשמר ב-DB) | ה-discriminator המפורש ביותר בקוד — נגזר ב-runtime מהשדות למעלה |

### Cross-referencing/matching

שני שלבים, בכל `getReportPreview`, שניהם אידמפוטנטיים:

1. **`DocumentPairingService`** — חשבונית↔קבלה מאותה רכישה: אותו `supplierId`+`invoiceNumber`,
   או fallback לפי amount±0.01/date±3 ימים
2. **`MatchingService`** — מסמך↔תנועת בנק: ±3 ימים / ±1₪, first-fit (לא אופטימלי — "doc
   שמגיע מאוחר לא יעקוף קישור קיים גם אם הוא התאמה טובה יותר")

### מודל בעלות (SYSTEM/ACCOUNTANT/CLIENT)

זכות ה"אישור" עצמה **אינה** תלויה בתפקיד — מותנית רק ב-`mappingStatus` (READY/PRIVATE).
מה שכן תלוי בתפקיד:

- `isActorAccountant` (המשתמש **האמיתי** המחובר, לא הלקוח המדומה בזמן impersonation)
  קובע ברירת מחדל "תצוגה מקצועית" מול "תצוגה רגילה", ומציג כפתור "השלמת מיפוי"
  (`completeExpenseMapping`) לשורות `MISSING_MAPPING`
- לקוח בלי הרשאת רו"ח פעילה (`clientHasActiveDelegation=false`) מקבל "בורר פשוט"
  (`simplePickerOptions`) כדי שלא ייתקע
- `mappedByAccountant` badge מציין ששורת הסיווג שייכת/אושרה ע"י רו"ח

---

## 3. טבלת שדות

| שדה | מקור | היכן מוצג |
|---|---|---|
| ספק (supplier) | `ExtractedDocument.supplier` (OCR) → נדרס ע"י `Supplier.category`/וכו' אם ספק ידוע | עמודת ספק, קבוע ב-`toDocSummary` |
| ספק מוכר/חדש | `matchedSupplierKnown` (lookup מול טבלת `Supplier`) | badge/label ליד שם הספק, דגל אדום לביטול "שמור כספק" |
| סכום | `ExtractedDocument.amount` (מסמך) / `abs(FullTransactionCache.amount)` (תנועה) | עמודת סכום (`sumLabel`), עם "(₪Y)" למטבע זר |
| מע"מ/מס % | קטלוג ממוזג — `classifyReviewRow` נגד הקטלוג, נופל ל-OCR/slim | עמודות `vatPercent`/`taxPercent`, ניתנות לעריכה חופשית |
| תאריך | `ExtractedDocument.date` / `FullTransactionCache.transactionDate` | עמודת תאריך |
| מסמך מקושר | `driveFileId`/`driveFileName` | אייקון עין → פאנל תצוגה מקדימה (iframe ל-Google Drive) |
| מספר חשבונית | `ExtractedDocument.invoiceNumber` | עמודה, גם שדה duplicate-detection |
| מספר הקצאה | `ExtractedDocument.allocationNumber` | עמודה (רק חשבוניות מעל הסף) |
| קטגוריה/תת-קטגוריה | `ReviewClassification` — resolution חי מול קטלוג ממוזג (CLIENT>ACCOUNTANT>SYSTEM) | dropdown קסקדי (תצוגה רגילה) או "כרטיס" (תצוגה מקצועית) |
| סטטוס מיפוי | `ReviewClassification.status` (READY/MISSING_MAPPING/PRIVATE/UNCLASSIFIED) | status badge צבעוני |
| סוג שורה | נגזר ב-runtime מ-`matchedTransactionId`/`matchedDocumentId` | אייקון + label ("מסמך + תנועה"/"מסמך בלבד"/"תנועה בלבד") + צביעת רקע שונה לכל טיפוס |

---

## 4. שלושת מנגנוני הסטטוס (pending/approved/rejected)

שלושה state machines **עצמאיים** — שורת סקירה אחת עשויה להיות מורכבת משני source rows
עם סטטוס נפרד לכל אחד, ובנוסף רשומת Expense עם סטטוס משלה לאחר האישור.

**`ExtractedDocStatus`** (על `ExtractedDocument.status`):
```
PENDING_REVIEW | APPROVED | ARCHIVED | REJECTED | PAIRED | ERROR | NOT_AN_EXPENSE
```

**`ExpenseApprovalStatus`** (על `Expense.approvalStatus`, [backend/src/enum.ts:353](../backend/src/enum.ts#L353)):
```
PENDING | APPROVED | REJECTED | MISSING_ACCOUNTING_MAPPING | NOT_AN_EXPENSE
```

**`DocumentKind`** (D8 routing, על `ExtractedDocument.documentKind`):
```
EXPENSE_INVOICE | ANNUAL_DOCUMENT | UNIDENTIFIED
```

**`SlimTransaction.confirmed: boolean`** — לא enum, פשוט flag: `false` = מועמד, טרם קודם ל-Expense.

**(concept נפרד!) `ApprovalStatus.PENDING_ACCOUNTANT_APPROVAL`** — זה **לא** סטטוס של הוצאה,
אלא של מיפוי sub-category→חשבון. זה מה שמזין את "הוצאות ממתינות" בפאנל הרו"ח (ראו הערת
המינוח למעלה).

---

## 5. הבדלים ויזואליים בין OCR לבנק

- **צבעים לפי סוג**: ירוק=matched, כתום=doc_only, כחול=tx_only
  ([report-review.page.scss:507-509](../frontend/src/app/pages/report-review/report-review.page.scss#L507-L509))
- **tx_only** לא מציג: driveFileId, invoiceNumber, allocationNumber, documentType,
  supplierId — כל אלה ריקים `""` כדי שהטבלה תרנדר תא ריק במקום `"null"`

---

## 6. בעיות/הערות — dead code, אי-התאמות, שאלות פתוחות

1. **flow-report מול report-review** — שני מסלולים נפרדים לאישור תנועת בנק כהוצאה:
   - `flow-report` ([frontend/src/app/pages/flow-report/](../frontend/src/app/pages/flow-report/)) —
     ישן, מדבר עם `transactions/save-trans-to-expenses`, אין לו מושג OCR/matching/D9
     classification. **אין אף `routerLink`/פריט תפריט שמצביע אליו** בניווט הנוכחי (רק
     ה-title-switch של `custom-toolbar` וה-routing module שלו). בניגוד ל-report-review,
     לראוט שלו **אין** `canActivate` guards כלל ב-[app-routing.module.ts](../frontend/src/app/app-routing.module.ts).
   - `tx_only` rows בתוך report-review — חדש, `reports/me/review/approve-tx-no-doc`,
     כולל D9 classification חי.
   - **צריך החלטה**: האם flow-report הוא legacy מיועד להסרה, או בשימוש מכוון מקביל?
     משפיע ישירות על תכנון שינויי ה-UX.

2. **`expenses.controller.ts` עדיין מכיל `bulk-confirm-from-drive`/`check-duplicates-from-drive`** —
   מסלול bulk ישן יותר לאישור מ-Drive; ה-CLAUDE.md של מודול expenses עצמו מציין
   שהוא "largely superseded by report-review's per-row approve endpoints" אך עדיין קיים בקוד.
   מועמד לבדיקת legacy-cleanup.

3. **אי-התאמה קלה בתיעוד**: ב-[reports.controller.ts:259](../backend/src/reports/reports.controller.ts#L259)
   ההערה על `reject-tx` אומרת "locks it to the current period so it doesn't re-surface",
   אבל ב-[report-review.service.ts:1148-1151](../backend/src/reports/report-review.service.ts#L1148-L1151)
   ההערה מסבירה במפורש ש-`vatReportingDate` **לא** נחתם בכוונה. ההתנהגות בפועל תואמת את
   השני (אין period stamp) — רק הערת ה-controller מיושנת.

4. **בלבול מינוחי אפשרי** — ראו "הערת מינוח חשובה" בראש הקובץ: יש שלושה דברים שונים
   שנקראים "הוצאות ממתינות"/"לאישור" בקוד: report-review (אישור הוצאות בודדות),
   פאנל הרו"ח (אישור מיפוי חשבונאי), ו-flow-report (כותרת תפריט "דוח-תזרים" בלבד,
   לא קשור ישירות לניסוח אבל אותו תחום פונקציונלי).

5. לא נמצאו TODO/FIXME/HACK בקבצי הליבה (`report-review.service.ts`,
   `report-review.page.ts`) — קוד מתועד היטב ונקי יחסית.

6. **קובץ page.ts גדול (2291 שורות)** — אם מתכננים refactor עיצובי, כדאי להחליט מראש
   איך לפרק אותו (למשל: להוציא state של הדיאלוגים המשניים לקומפוננטות נפרדות) לפני
   שנוגעים ב-UI, כי הלוגיקה שזורה מאוד בתבנית.

7. **טרם נבדק**: מה בדיוק קורה ב-UI ללקוח שאין לו מודול Open Banking כשהוא מגיע לעמוד —
   ה-endpoints `approve-matched`/`approve-tx-no-doc`/`reject-tx`/`upload-doc-to-tx` כולם
   גדורים ב-`@RequireModule(ModuleName.OPEN_BANKING)` ברמת ה-controller, אך לא אימתתי
   את חוויית ה-frontend (מוסתר לגמרי? מוצג ונכשל בבקשה?) עבור לקוח כזה.

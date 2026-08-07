# מחקר: שמירת עריכה חוסמת ל-DB (onEditDialogSave) — לפני מימוש

מסמך זה עונה על 5 השאלות שנשאלו, עם ציטוטי קוד וקבצים מדויקים. אין כאן שום שינוי קוד — מחקר בלבד. בסוף יש סיכום של שני ממצאים לא-מתוכננים שחשוב להכריע עליהם *לפני* שממשיכים לתכנון המימוש.

---

## שאלה 1 — אילו שדות כבר קיימים כעמודות

בדקתי את שתי הישויות ישירות:
- `backend/src/documents/extracted-document.entity.ts`
- `backend/src/transactions/slim-transaction.entity.ts`
(וגם `backend/src/transactions/full-transaction-cache.entity.ts`, כי חלק מהשדות שחשבתי שיהיו על SlimTransaction מתגלים כקיימים רק שם).

| שדה ב-`overridesFromRow` | `ExtractedDocument` | `SlimTransaction` | הערה |
|---|---|---|---|
| `category` | ✅ `category` | ✅ `category` | |
| `subCategory` | ✅ `sub_category` | ✅ `subCategory` | |
| `subCategoryId` | ✅ `sub_category_id` | ❌ **אין עמודה כזו בכלל** | ה-D1/D9 pointer קיים רק על המסמך, לא על SlimTransaction |
| `vatPercent` | ✅ `vat_percent` | ✅ `vatPercent` | |
| `taxPercent` | ✅ `tax_percent` | ✅ `taxPercent` | |
| `isEquipment` | ✅ `is_equipment` | ✅ `isEquipment` | |
| `date` | ✅ `date` | ❌ **אין** — התאריך חי רק על `FullTransactionCache.transactionDate` | |
| `amount` | ✅ `amount` | ❌ **אין** — הסכום חי רק על `FullTransactionCache.amount` | |
| `supplierId` | ✅ `supplier_id` | ❌ **אין מושג "ספק" בכלל** ל-SlimTransaction | |
| `supplier` | ✅ `supplier` | ❌ אין — השם החי הוא `FullTransactionCache.merchantName` (עובדה גולמית מהבנק) | |
| `invoiceNumber` | ✅ `invoice_number` | ❌ לא רלוונטי | |
| `allocationNumber` | ✅ `allocation_number` | ❌ לא רלוונטי (תמיד היה doc-only) | |
| `documentType` | ✅ `document_type` | ❌ לא רלוונטי (תמיד היה doc-only) | |
| `reportPeriod` | ❌ **אין עמודה כזו על ExtractedDocument בכלל** | ✅ `vatReportingDate` | הפוך ממה שהנחתי |
| `reportPeriodOverridden` | ❌ לא DB — flag פרונט בלבד | ❌ לא DB | |
| `saveAsSupplier` | ❌ לא DB — flag התנהגות בזמן approve בלבד | ❌ לא DB | |

**מסקנה:** ההנחה "רוב זה כבר קיים כי זה נטען משם כברירת מחדל" נכונה בערך ל-`ExtractedDocument` (12/16), אבל **שגויה משמעותית** ל-`SlimTransaction` (רק 5/16 — category/subCategory/vatPercent/taxPercent/isEquipment). בפרט: `reportPeriod` — השדה שהכי סביר שתרצו לשמור מוקדם — קיים **רק** על SlimTransaction ו**חסר לגמרי** על ExtractedDocument.

---

## שאלה 2 — endpoint חלקי קיים (לא-approve)?

### צד המסמך (ExtractedDocument)
חיפשתי כל `extractedDocRepo.update(...)` מחוץ לנתיבי ה-OCR/approve. כל מה שמצאתי הוא **status-only**:
- `archiveDocument` (`documents.service.ts:3120`) — כותב רק `{ status }`
- `fileDocumentAsAnnual` (שם:3200) — כותב רק `{ status, documentKind }`
- `setDocumentKind` (שם:3239) — כותב רק `{ documentKind }`

**אין שום endpoint קיים שכותב category/subCategory/vatPercent/וכו' על ExtractedDocument.** צריך אחד חדש. הצעת שם: `PATCH /reports/me/review/update-doc/:documentId` (תואם למוסכמת ה-routes הקיימת תחת `reports/me/review/*`), עם DTO שמקבל את תת-קבוצת השדות הרלוונטית מ-`ReviewOverrides`.

### צד התנועה (SlimTransaction) — יש כבר endpoint, אבל **הוא לא מתאים סמנטית**
מצאתי `POST /transactions/classify-trans` → `TransactionProcessingService.classifyManually()` (`transaction-processing.service.ts:578`). זה *כן* כותב ל-SlimTransaction+FullTransactionCache בלי approve. אבל:

1. הוא לא מקבל `subCategoryId` בכלל (רק `category`/`subCategory` כמחרוזות) — כי SlimTransaction אין לו עמודה כזו (ראו שאלה 1). המשמעות: הוא לא עובר דרך אותה resolution של D9/`classifyReviewRow` שה-preview/approve כן עוברים.
2. הוא מייצר side-effects שלא רוצים כאן: `classificationType: ONE_TIME`, יצירה/עדכון rule-engine (`ClassifiedTransactions`), guard על `isLocked` שקשור לדיווח מע"מ ולא ל-review flow הזה.
3. יש לו שדות חובה (`reductionPercent`, `isRecognized`, `reportScope`) שלא קיימים ב-`ReviewOverrides` כלל.

**מסקנה: זה endpoint אמיתי אבל שייך לפיצ'ר אחר (סיווג ידני/rule-based של עסקאות בנק, למשל מעמוד transactions), לא ל-review flow. שימוש בו כאן ישבור/יעקוף את ה-D9 catalog resolution ויכניס side-effects לא רצויים. צריך endpoint חדש גם כאן** — הצעה: `PATCH /reports/me/review/update-tx/:slimTransactionId`.

---

## שאלה 3 — matched row: מקור האמת לכתיבה

מ-`report-review.service.ts:613-616` (`approveMatched`), תגובה מפורשת בקוד עצמו:

```ts
// Resolve final values: override > doc > slim. Doc wins over slim
// because matched rows are anchored on the document (it's the source
// for VAT-deduction evidence); slim is the bank-side classification.
const finalCategory    = overrides.category    ?? doc.category    ?? slim.category;
```

**מאומת: doc מנצח slim.** תואם בדיוק את מה שראית ב-`toEditableRow` הפרונטי.

**ממצא נוסף, קריטי לתכנון:** גם ב-approve עצמו, ל-`ExtractedDocument`/`SlimTransaction` נכתבים **רק** `status`/`confirmedExpenseId`/`documentKind`/`confirmed`/`vatReportingDate` (+`allocationNumber`/`documentType` רק אם נשלחו overrides). **`category`/`subCategory`/`vatPercent`/`taxPercent`/`isEquipment`/`supplier` אף פעם לא נכתבים בחזרה על doc/slim — הם זורמים רק ל-Expense החדש.** בדקתי את שלוש מתודות ה-approve (`approveMatched`, `approveTxNoDoc`, וגם `approveDocCash` יש לו אותו דפוס) — עקבי לחלוטין. זה אומר שהתכונה שאתה מבקש ("שמירה חוסמת ל-DB בזמן עריכה") היא **יכולת חדשה לגמרי** — לא רק "להזיז מוקדם יותר" כתיבה שכבר קיימת; לא הייתה עד היום אף נקודה בזמן שבה category/subCategory/vatPercent נכתבים על doc/slim עצמם.

---

## שאלה 4 — cascade לשורות-אחיות

`cascadeToSupplierSiblings` (frontend, `report-review.page.ts`) כרגע מפעילה `mutate` על N שורות בזיכרון בבת אחת, ללא קריאת שרת. אם `onEditDialogSave` הופך לחסום עם קריאת שרת יחידה, וה-cascade עדיין רץ על מספר שורות — צריך N קריאות שרת (אחת per document/transaction).

**הצעה (לדיון, לא סופית):** לרוץ ברצף כמו `runBulkQueue` הקיים (לא parallel, כדי לא להעמיס DB עם N טרנזקציות בו-זמנית — אותו נימוק בדיוק שכבר כתוב שם), עם progress בתוך הדיאלוג ("שומר 3/12 שורות...") במקום spinner יחיד סתום. Batch endpoint (מקבל מערך documentId/slimTransactionId בבקשה אחת) יהיה מהיר יותר אבל הוא שינוי גדול יותר בצד השרת (טרנזקציה אחת גדולה מול N קטנות) — לדעתי לא שווה את זה בשלב הזה, אלא אם ה-cascade נוגע בפועל להרבה שורות (עשרות) באופן שגרתי. שווה לשאול אותך: כמה שורות בד"כ חולקות ספק בטבלה אחת בפועל?

---

## שאלה 5 — האם זה סותר/מכפיל את approve הקיים?

**מאומת: לא.** `overridesFromRow` (frontend) תמיד שולח את המצב המלא הנוכחי של ה-row בזמן approve, בין אם נשמר קודם ל-DB ובין אם לא — שום דבר שם לא צריך להשתנות. במקרה שהמשתמש שמר קודם ואז מאשר, ה-override שנשלח יהיה פשוט זהה למה שכבר על ה-DB row (redundant אך לא מזיק — `override ?? doc.field` יפתור לאותו ערך בשני המקרים).

---

## שני ממצאים שדורשים הכרעה שלך לפני תכנון המימוש

1. **`reportPeriod` על ExtractedDocument** — אין עמודה. כדי לשמור עריכת תקופת דיווח עבור שורת doc_only/matched *לפני* אישור, צריך: (א) migration שמוסיפה עמודה (`vat_reporting_date`? לפי docs/redesign/cutover.sql, ראה CLAUDE.md הראשי — "כל שינוי סכימה/דאטה חייב להתווסף ל-cutover.sql"), או (ב) לא לתמוך בשמירה חוסמת ל-`reportPeriod` בשלב הזה ולהשאיר אותו client-side-only כמו היום (ה-badge "overridden" פשוט יאבד אם המשתמש עוזב לפני approve, בדיוק כמו היום).

2. **`subCategoryId` על SlimTransaction** — אין עמודה. כדי לשמור סיווג D9-מדויק (לא רק שם) לשורת tx_only/matched (בצד slim) לפני אישור, צריך גם כן migration. בלעדיה, שמירה חוסמת של tx_only תוכל לשמור רק category/subCategory/vatPercent/taxPercent/isEquipment (שם, לא id) — בטעינה חוזרת (`loadPreview`) זה יעבור שוב דרך `classifyReviewRow`/ה-name-fallback הרגיל (בדיוק כמו UNCLASSIFIED legacy rows היום) ויתכן שיפתור סימוכין (subCategoryId) שונה במקרה של שם דו-משמעי — נדיר אבל אפשרי.

שני אלה הם **שינויי סכימה** (עמודות חדשות) — לא רק קוד. לפי ה-CLAUDE.md הראשי של הפרויקט, אנחנו באמצע redesign שדורש שכל שינוי כזה יתועד ב-`docs/redesign/cutover.sql` ושההחלטות D1-D15 שם הן final ואסור לסתור אותן בלי לעצור ולשאול. אני לא ממליץ להוסיף עמודות בלי שתאשר את זה במפורש — זה בדיוק המקרה של "המציאות סותרת את התוכנית, לעצור ולשאול" שה-CLAUDE.md מגדיר.

**שאלה מסכמת אליך:** האם השמירה החוסמת צריכה לכסות reportPeriod/subCategoryId-מדויק במלואם (→ נדרש migration), או שמקובל שהיא שומרת רק את מה שכבר יש לו עמודה היום (category/subCategory-שם/vatPercent/taxPercent/isEquipment/date/amount/supplier/invoiceNumber/allocationNumber/documentType — כל אחד רק על הישות שבאמת יש לה את העמודה), ו-reportPeriod/subCategoryId-מדויק נשארים "מה שכבר יש היום" (מתאפסים אם עוזבים בלי לאשר)?

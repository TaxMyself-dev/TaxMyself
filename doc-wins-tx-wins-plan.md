# matched-row classification: doc-wins → tx-wins — שלב 2 (תוכנית שינוי)

תאריך: 2026-08-06
היקף: `report-review` — הופכים את כלל ה-classification (category/subCategory/
subCategoryId/vatPercent/taxPercent/isEquipment) של שורת **matched** מ-"doc wins"
ל-"tx wins", בכל שורת matched (גם matching אוטומטי, גם קישור ידני דרך "קשר מסמך").
המסמך נשאר "אסמכתא" בלבד (driveFileId/invoiceNumber/allocationNumber/documentType —
לא משתנים, תמיד מהמסמך). `displaySource` (supplier/date/amount/sumLabel/currency/
ilsAmount/sourceTypeLabel — מסבב קודם) הוא ציר **נפרד לגמרי**, לא נוגעים בו.

הוחלט (ולא נדון מחדש):
1. **reductionPercent לא נכנס לפלוג** — ממשיך להיגזר מהקטלוג (`account.reductionPercent`)
   לפי ה-subCategoryId שנבחר (גם אם ה-id עצמו הגיע מ-tx). אין "ערך מסמך" מתחרה — ל-
   `ExtractedDocument` אין בכלל עמודת reductionPercent.
2. **`stampedSubCategoryId` ל-tx_only** — צריך לקרוא בפועל מ-`transaction.subCategoryId`,
   לא רק name-matching כמו היום.
3. **`classifyReviewRow` (Site A)** — משנה את **החתימה** שלה כדי לממש tx-wins בעצמה,
   לא רק fallback חיצוני אחרי הקריאה.

---

## המפה: 7 אתרים (A–G)

| אתר | קובץ | מה זה | בסקופ? |
|---|---|---|---|
| A | `backend/src/reports/report-review.service.ts` | `classifyReviewRow` + 3 call sites (matched/doc_only/tx_only) ב-`getReportPreview` | **כן — האתר האמיתי** |
| B | אותו קובץ, `approveMatched` | `overrides ?? doc ?? slim` מקומי + `reductionPercent: 0` קשיח | כן, אך dead-in-practice דרך ה-UI (ראה למטה) |
| C | אותו קובץ, `approveDocCash` | אותו `reductionPercent: 0` | doc/tx לא רלוונטי (אין צד tx); הבאג עצמו כן |
| D | אותו קובץ, `approveTxNoDoc` | — | לא רלוונטי |
| E | `frontend/.../report-review.page.ts` | `updateDocFields`/`updateTxFields` — ניתוב שמירת עריכה pre-approval | כן |
| F | אותו קובץ, `toEditableRow` | fallback client-side `c ?? docSide ?? txSide` | כן, flip פשוט |
| G | אותו קובץ, `buildMatchedRow` דרך `confirmLink` | `classificationBase` (docRow/txRow) | כן |

### הממצא המרכזי (מה-audit של שלב 1)
`overridesFromRow` ([report-review.page.ts:2231](frontend/src/app/pages/report-review/report-review.page.ts))
תמיד שולח ל-approve ערכים **קונקרטיים** (גם `''`/`0`/`false`, לא `undefined`) — אז
ה-`??` ב-approveMatched (Site B) **כמעט אף פעם לא רץ בפועל** דרך ה-UI (single/bulk
כאחד). האתר שבאמת קובע מה המשתמש רואה ומאשר הוא **Site A** — `classifyReviewRow`'s
call site למatched, ששולח היום רק `document` (אף פעם לא `transaction`).

---

## A. `classifyReviewRow` — חתימה חדשה

```ts
private classifyReviewRow(
  catalog: SubCategory[],
  ownerFirebaseId: string,
  source: {
    /** tx-side — מנוסה ראשון (tx wins). matched + tx_only. */
    tx?: { category?: string | null; subCategory?: string | null; subCategoryId?: number | null } | null;
    /** doc-side — fallback רק אם tx לא נתן שום match (שם+id). matched + doc_only.
     *  גם המקור היחיד ל-D7 docInput (documentType/supplier/invoiceNumber). */
    doc?: {
      category?: string | null; subCategory?: string | null; subCategoryId?: number | null;
      documentType?: string | null; supplier?: string | null; invoiceNumber?: string | null;
    } | null;
  },
): ReviewClassification {
  const tryMatch = (cand?: { category?: string|null; subCategory?: string|null } | null) => {
    const catName = cand?.category?.trim() || null;
    const subName = cand?.subCategory?.trim() || null;
    if (!subName) return undefined;
    const bySubName = catalog.filter(s => s.name === subName);
    return (catName ? bySubName.find(s => s.category?.name === catName) : undefined) ?? bySubName[0];
  };

  // שלב 1: זוג שם מלא — tx קודם; doc רק אם tx לא נתן כלום (לא ערבוב שדה-שדה).
  let sub = tryMatch(source.tx) ?? tryMatch(source.doc);

  // שלב 2: stamped id — אותה קדימות.
  if (!sub) {
    const stampedId = source.tx?.subCategoryId ?? source.doc?.subCategoryId;
    if (stampedId != null) sub = catalog.find(s => s.id === stampedId);
  }

  const doc = source.doc;
  const docInput = doc?.documentType
    ? { documentType: doc.documentType as any, supplier: doc.supplier ?? null, invoiceNumber: doc.invoiceNumber ?? null }
    : null;

  // ...שאר הפונקציה כמו היום (UNCLASSIFIED shape / resolved shape),
  //    reductionPercent ממשיך מ-account.reductionPercent בלבד (החלטה 1).
}
```

**מענה לשאלת ה-fallback** ("מה קורה כשל-slim אין קטגוריה"): tx לא נותן match →
נופל אוטומטית ל-doc (עדיין שלב 1) → אם גם doc לא, stamped-id (tx קודם) → UNCLASSIFIED.
כלומר יש נפילה מסודרת חזרה למסמך, לא UNCLASSIFIED מוחלט.

### 3 ה-call sites (בתוך `getReportPreview`)

```ts
// matched (~:435-440) — עכשיו שולח גם tx
const document = this.toDocSummary(doc, knownSupplierById);
const transaction = this.toTxSummary(tx.slim, tx.cache);
classification: this.classifyReviewRow(mergedCatalog, firebaseId, {
  tx:  { category: transaction.category, subCategory: transaction.subCategory, subCategoryId: transaction.subCategoryId },
  doc: { category: document.category, subCategory: document.subCategory, subCategoryId: doc.subCategoryId,
         documentType: document.documentType, supplier: document.supplier, invoiceNumber: document.invoiceNumber },
}),

// doc_only (~:452) — doc בלבד, שינוי מכני (עטיפה תחת doc:)
classification: this.classifyReviewRow(mergedCatalog, firebaseId, {
  doc: { category: document.category, subCategory: document.subCategory, subCategoryId: doc.subCategoryId,
         documentType: document.documentType, supplier: document.supplier, invoiceNumber: document.invoiceNumber },
}),

// tx_only (~:484-487) — עכשיו כולל subCategoryId (החלטה 2)
classification: this.classifyReviewRow(mergedCatalog, firebaseId, {
  tx: { category: transaction.category, subCategory: transaction.subCategory, subCategoryId: transaction.subCategoryId },
}),
```

**דרישת תשתית:** `subCategoryId` חדש על `ReviewTxSummary`:
- Backend DTO: `backend/src/reports/dtos/report-review.dto.ts:67-89`
- `toTxSummary`: `backend/src/reports/report-review.service.ts:1499-1522` — מוסיף `subCategoryId: slim.subCategoryId`
- Frontend mirror: `frontend/src/app/services/report-review.service.ts:53-86`

---

## B. `approveMatched` — flip הגנתי + תיקון reductionPercent

`backend/src/reports/report-review.service.ts:644-659, 694, 704`

```ts
const finalCategory    = overrides.category    ?? slim.category    ?? doc.category;
const finalSubCategory = overrides.subCategory ?? slim.subCategory ?? doc.subCategory;
const finalVatPercent  = Number(overrides.vatPercent ?? slim.vatPercent ?? doc.vatPercent);
const finalTaxPercent  = Number(overrides.taxPercent ?? slim.taxPercent ?? doc.taxPercent);
...
subCategoryId: overrides.subCategoryId ?? slim.subCategoryId ?? doc.subCategoryId ?? undefined,
```

**reductionPercent (החלטה 1, לא קשור ל-tx/doc):** מוחקים את השורה `reductionPercent: 0,`
מה-DTO של `addExpense` לגמרי — לא שולחים את השדה בכלל (בדיוק כמו `isEquipment` היום),
כדי ש-`resolved.reductionPercent` (מהקטלוג) ינצח תמיד. ראה
`backend/src/expenses/expenses.service.ts:150`.

---

## C. `approveDocCash` — לא בסקופ doc/tx, אבל אותו באג reductionPercent

`backend/src/reports/report-review.service.ts:854`

⚑ **דגל פתוח:** ממליץ למחוק גם כאן את `reductionPercent: 0,` (אותה סיבה כמו B —
אין "ערך מסמך" מתחרה). לא התבקש במפורש, רק flag משלב 1. אם רוצים להשאיר בצד
(commit נפרד) — להסיר מהתוכנית.

---

## D. `approveTxNoDoc` — אין שינוי

---

## E. עריכה pre-approval — `updateDocFields`/`updateTxFields`

`frontend/src/app/pages/report-review/report-review.page.ts:~881` (מתודת השמירה בדיאלוג העריכה)

**לא נוגעים ב-`updateDocFields`** (matched ממשיך לכתוב את הכל לשם כמו היום — כדי
שאם "פצל"/unpair קורה, ה-doc_only שנחשף לא יראה סיווג ישן). **מוסיפים** קריאה
מקבילה ל-`updateTxFields` עבור matched:

```ts
const obs$ = row.type === 'tx_only' ? updateTxFields(...) : updateDocFields(...); // ללא שינוי

const classificationObs$ = row.type === 'matched'
  ? this.reviewService.updateTxFields(this.businessNumber(), row.slimTransactionId!, {
      category: row.category, subCategory: row.subCategory, subCategoryId: row.subCategoryId ?? undefined,
      vatPercent: row.vatPercent, taxPercent: row.taxPercent, isEquipment: row.isEquipment,
    })
  : null;

(classificationObs$ ? forkJoin([obs$, classificationObs$]) : obs$).pipe(...).subscribe(...);
```

- `reportPeriod` — לא בסקופ, לא נוגעים (ממילא נכתב לשני הצדדים בנפרד ב-approve).
- `reductionPercent` — לא מוסיפים ל-`UpdateTxFields` (החלטה 1: לא נערך ידנית).
- דורש `import { forkJoin } from 'rxjs'` (עדיין לא מיובא ב-page.ts).

⚑ **דגל פתוח:** זו המלצה (doc+slim, לא flip נקי) כדי למנוע unpair-חושף-סיווג-ישן.
חלופה: matched כותב *רק* ל-slim מרגע הקישור (doc-side classification קופא). לאשר איזו גרסה.

---

## F. Frontend `toEditableRow` — flip פשוט

`frontend/src/app/pages/report-review/report-review.page.ts:692-696`

```ts
const category    = c.categoryName    ?? txSide?.category    ?? docSide?.category    ?? '';
const subCategory = c.subCategoryName ?? txSide?.subCategory ?? docSide?.subCategory ?? '';
const vatPercent  = Number(c.vatPercent  ?? txSide?.vatPercent  ?? docSide?.vatPercent  ?? 0);
const taxPercent  = Number(c.taxPercent  ?? txSide?.taxPercent  ?? docSide?.taxPercent  ?? 0);
const isEquipment = !!(c.isEquipment ?? txSide?.isEquipment ?? docSide?.isEquipment ?? false);
```

`reductionPercent` כבר `Number(c.reductionPercent ?? 0)` בלבד ([:742](frontend/src/app/pages/report-review/report-review.page.ts))
— אין fallback ל-docSide/txSide כאן מלכתחילה, **אין שינוי נדרש**.

---

## G. Frontend `buildMatchedRow` — confirmLink הופך classificationBase

`frontend/src/app/pages/report-review/report-review.page.ts` (confirmLink, ~:2153)

```ts
const merged = this.buildMatchedRow(txRow, {   // היה: docRow
  rowKey: `matched:${docRow.documentId}:${txRow.slimTransactionId}`,
  slimTransactionId: txRow.slimTransactionId,
  displaySource: 'tx',
  // זהות/אסמכתא — תמיד מהמסמך, לא מושפע מההיפוך:
  documentId: docRow.documentId,
  driveFileId: docRow.driveFileId,
  driveFileName: docRow.driveFileName,
  invoiceNumber: docRow.invoiceNumber,
  allocationNumber: docRow.allocationNumber,
  documentType: docRow.documentType,
  documentTypeLabel: docRow.documentTypeLabel,
  // supplier/date/amount/sumLabel/currency/ilsAmount — לא נדרסים, כבר tx's own
});
```

`mergeUploadedDocIntoRow` — **אין שינוי בכלל**, כבר `buildMatchedRow(txRow, {...})`
היום (במקרה תאם לכלל החדש, מהסיבה המקורית: מסמך טרי לא עבר סיווג).

`displaySource` — **לא נוגעים**, ציר נפרד לגמרי (supplier/date/amount/sumLabel/
currency/ilsAmount/sourceTypeLabel בלבד). ל-matched טבעי: תצוגה נשארת doc-primary,
סיווג הופך tx-primary — בכוונה, לפי האישור ("גם matched אוטומטי").

**קומנטרים לעדכן (לא פונקציונלי אך יהיו שקריים):**
- `EditableReviewRow.displaySource` docstring ([:75-79](frontend/src/app/pages/report-review/report-review.page.ts)) — המשפט "D9 classification... always stays doc-wins" לא נכון יותר
- `buildMatchedRow` docstring ([:300-313](frontend/src/app/pages/report-review/report-review.page.ts))
- `mergeUploadedDocIntoRow` docstring
- confirmLink inline comment

---

## טסטים

### `report-review-classification.spec.ts` (13 טסטים) — שינוי מכני, לא 13 עדכונים
כל ה-`it` עוברים דרך helper משותף ([:14-21](backend/src/reports/report-review-classification.spec.ts)).
מספיק לעדכן רק אותו:
```ts
const classify = (catalog, owner, source, stampedId = null) =>
  ReportReviewService.prototype.classifyReviewRow.call({}, catalog, owner,
    { doc: { ...source, subCategoryId: stampedId } });
```
(עוטף את ה-source הקיים כ-`doc`). **0 שינוי בגוף כל `it`** — הן source-agnostic, לא בודקות doc-wins.

**חדש:** 2-3 `it` נוספים לבדיקת precedence: tx עם match מנצח doc סותר; tx בלי
match נופל ל-doc; stamped-id tx מנצח stamped-id doc. זה גם "התפר A→B" שהתבקש —
לא בונים infrastructure כבד ל-`getReportPreview` (לא קיים כזה לאף טסט בקובץ
היום), אלא טסט ישיר על `classifyReviewRow({tx,doc})` עם שני צדדים סותרים —
בפועל זה כל מה שה-call site עושה אחרי A (מעביר את שני האובייקטים בלי טרנספורמציה).

### `expense-classification.spec.ts` (32 טסטים) — 0 שינוי צפוי
בודק `ExpensesService` ישירות עם DTO מוכן מראש, לא עובר דרך `report-review.service.ts`.
יוצא דופן פוטנציאלי: fixture עם `reductionPercent: 0` — לבדוק בפועל בזמן המימוש,
לא צפוי לשבור (השינוי הוא ב-report-review.service.ts, לא ב-expenses.service.ts).

### `report-review-dockind.spec.ts` — 0 שינוי (D8 guards בלבד)

---

## סדר מימוש מוצע (commit אחד)

1. DTO: `ReviewTxSummary.subCategoryId` (backend + frontend)
2. `classifyReviewRow` — חתימה חדשה + 3 call sites + `toTxSummary`
3. `approveMatched`/`approveDocCash` — flip + מחיקת `reductionPercent: 0`
4. `updateTxFields` call נוסף ב-page.ts (edit-dialog save)
5. `buildMatchedRow` ב-confirmLink (G) + `toEditableRow` (F) + עדכון קומנטרים
6. עדכון `report-review-classification.spec.ts` helper + 3 טסטים חדשים
7. `npx tsc --noEmit` (backend + frontend) + `ng build` + הרצת backend spec suite הרלוונטי

## דגלים פתוחים לאישור לפני מימוש
- **C**: למחוק גם ב-`approveDocCash` את `reductionPercent: 0`? (כן/לא/commit נפרד)
- **E**: matched כותב ל-doc **וגם** ל-slim (המלצה), או flip נקי (רק slim)?

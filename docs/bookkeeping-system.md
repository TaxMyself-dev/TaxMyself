# הנהלת חשבונות (Journal / Ledger) — תיעוד המצב הקיים

מסמך זה מתאר את המימוש בפועל של מודול הנהלת החשבונות הכפולה (`backend/src/bookkeeping`,
`backend/src/expenses`, `backend/src/documents`, `backend/src/reports`) — לא איך *צריך* שזה
יעבוד, אלא איך זה עובד היום בקוד.

---

## 1. ארכיטקטורה כללית

יש הפרדה ברורה בין שתי שכבות:

- **`bookkeeping.service.ts`** — שכבת התמדה (persistence) גנרית, "טיפשה". אין בה שום לוגיקה
  עסקית של מע"מ / עוסק פטור-מורשה / בחירת כרטיס. היא רק:
  - מוודאת שכל `accountCode` שמתקבל קיים בטבלת `default_booking_account` (`findOneByOrFail`)
    — **אם כרטיס לא קיים, הפעולה כולה נכשלת לפני שנכתב משהו** (`persistJournalEntry`, שורה 88).
  - מקצה `entryNumber` (מספר פקודה רץ per-business) דרך `SharedService.getJournalEntryCurrentIndex`.
  - שומרת את כותרת הפקודה (`JournalEntry`) ואת השורות (`JournalLine`), בתוך טרנזקציה.
  - מספקת גם `replaceJournalEntryLines` (מחליף רק את השורות של פקודה קיימת) ו-
    `updateJournalEntryFull` (מעדכן גם את הכותרת וגם את השורות — משמש בעריכת הוצאה).
- **`expenses.service.ts`** ו-**`documents.service.ts`** — כאן נמצאת כל הלוגיקה העסקית:
  איזה כרטיסים לחייב/לזכות, מתי לכלול שורת מע"מ, ומה הסכומים. הן בונות מערך `JournalLineInput[]`
  ומעבירות אותו ל-`bookkeepingService.createJournalEntry`.

כל פקודת יומן שנוצרת היום היא **מאוזנת מבחינה חשבונאית** (סה"כ חובה = סה"כ זכות בכל פקודה),
אך היא **פשוטה בכוונה**: 2–3 שורות בלבד, תמיד "צד נגדי" יחיד (`1100`/`1200`/`4000`), ללא הבחנה
בין שיטות תשלום, וללא חובות ספקים נדחים. פירוט מלא בסעיף 6 ("מה נשאר").

---

## 2. פעולות שיוצרות פקודת יומן — לפי `JournalReferenceType`

מתוך 11 הערכים המוגדרים ב-`enum.ts` (`JournalReferenceType`), **רק חמישה נמצאים בשימוש בפועל**:
`EXPENSE`, `RECEIPT`, `TAX_INVOICE`, `TAX_INVOICE_RECEIPT`, `CREDIT_INVOICE`.
`TRANSACTION_INVOICE` מוגדר אך אף פעם לא מיוצר. `PAYMENT`, `MANUAL`, `VAT_PAYMENT`, `ADJUSTMENT`,
`OPENING_BALANCE` מוצהרים ב-enum אך **לא נעשה בהם שום שימוש בקוד כיום** — הם "שמורים" לעתיד.

הבחנת עוסק פטור/מורשה נשלטת ע"י `BusinessType` (`enum.ts`, על הישות `Business`):
`EXEMPT` (עוסק פטור), `LICENSED` (עוסק מורשה), `LIMITED_COMPANY`, `AUTHORIZED_PARTNERSHIP`,
`EXEMPT_PARTNERSHIP`. הפונקציה `isExemptBusinessType()` מחזירה `true` עבור `EXEMPT` ו-
`EXEMPT_PARTNERSHIP`. **אין ענף קוד נפרד ל"עוסק פטור"** — בפועל, עבור עסק פטור פשוט מאפסים
מראש את סכום המע"מ (`vatPercent=0` / `vat=0`), וזה גורם לבונה השורות לדלג על שורת המע"מ
מעצמו (כי התנאי הוא תמיד "האם `vat > 0`", לא "האם העסק מורשה").

### 2.1 הוצאה — `EXPENSE`

מקור: `addExpense` (הוספת הוצאה ידנית / מ-Drive OCR / אישור תנועת בנק ל-הוצאה) וגם
`updateExpense` (עריכה, דרך `syncExpenseJournalEntry`).
בונה השורות: `buildExpenseJournalLines` (`expenses.service.ts:931`).
כרטיס ההוצאה עצמו נקבע ע"י `resolveAccountCode` (ראו סעיף 4).

| | עוסק פטור (או vatPercent=0 לפריט) | עוסק מורשה עם מע"מ ניתן לניכוי |
|---|---|---|
| חובה | כרטיס ההוצאה — **הסכום המלא** | כרטיס ההוצאה — **נטו** (סכום ללא מע"מ) |
| חובה | — | `2410` מע"מ תשומות — **סכום המע"מ הניתן לניכוי** |
| זכות | `1100` (בנק) — הסכום המלא | `1100` (בנק) — הסכום המלא (נטו + מע"מ) |

**הערות חשובות:**
- הצד הנגדי מקובע תמיד ל-`1100` (בנק). הכרטיסים `1110` (מזומן) ו-`1120` (אשראי/סליקה) **קיימים
  בתרשים החשבונות אך אף פעם לא נזקפים אליהם בפועל** — שיטת התשלום בפועל לא משפיעה על הרישום.
- אין רישום ל-`2000` (ספקים) — אין מושג של הוצאה בהקפה/דחיית תשלום; כל הוצאה נרשמת כאילו שולמה
  מיידית.
- גם בעוסק מורשה, אם לפריט הספציפי `vatPercent=0` (למשל ארנונה, ביטוח רכב — ראו טבלת
  `SUBCATEGORY_VAT_DEFAULTS` ב-`account-seed.service.ts`), הרישום עובר לענף "ללא מע"מ".
- `taxPercent`/`vatPercent` על שורת היומן (`amountForTax`) הם אלה שמזינים את דוח רו"ה — כך
  שהוצאה חלקית-מוכרת (רכב פרטי 67%, כיבוד 0% מע"מ וכו') נכנסת לדוח בסכום הנכון.

### 2.2 קבלה — `RECEIPT`

| | עוסק פטור | עוסק מורשה |
|---|---|---|
| חובה | `1100` — נטו | `1100` — הסכום המלא |
| זכות | `4000` — נטו | `1200` (לקוחות) — הסכום המלא |

- **בעוסק פטור אין שורת מע"מ כלל** — ההכנסה מוכרת ישירות בקבלה (cash-basis), אין `2400`.
- **בעוסק מורשה, הקבלה לא יוצרת הכנסה** — היא רק סוגרת את חוב הלקוח (`1200`); ההכנסה כבר
  הוכרה כשהופקה חשבונית המס שקדמה לה.

### 2.3 חשבונית מס / חשבונית מס-קבלה — `TAX_INVOICE` / `TAX_INVOICE_RECEIPT`

צד נגדי (`counterCode`): `1100` אם `TAX_INVOICE_RECEIPT` (תשלום מיידי), `1200` אם `TAX_INVOICE`
(לקוחות/הקפה).

| | vat = 0 (למשל עוסק פטור, אם בכלל מפיק סוג מסמך זה) | vat > 0 |
|---|---|---|
| חובה | `counterCode` — הסכום המלא | `counterCode` — הסכום המלא |
| זכות | `4000` — נטו | `4000` — נטו |
| זכות | — | `2400` (מע"מ עסקאות) — סכום המע"מ |

### 2.4 חשבונית זיכוי — `CREDIT_INVOICE`

היפוך מדויק של `TAX_INVOICE`/`TAX_INVOICE_RECEIPT` (לפי סוג המסמך שאותו מזכה):

| | |
|---|---|
| זכות | `counterCode` (`1100` אם המסמך שזוכה הוא `TAX_INVOICE_RECEIPT`, אחרת `1200`) — הסכום המלא |
| חובה | `4000` — נטו |
| חובה | `2400` — מע"מ (רק אם `vat > 0`) |

### 2.5 מסמכים שלא יוצרים פקודת יומן כלל

`TRANSACTION_INVOICE`, הצעת מחיר (`PRICE_QUOTE`), הזמנת עבודה (`WORK_ORDER`) —
`buildDocumentJournalLines` מחזיר `null` עבורם, ואין שום פקודה נוצרת.

### 2.6 תנועות בנק / אשראי

תנועות בנק (`transaction-processing.service.ts`, `transactions.service.ts`) **לא יוצרות פקודה
משלהן** ולא משתמשות ב-`JournalReferenceType.PAYMENT` (שאף פעם לא בשימוש). כשתנועת בנק
מאושרת והופכת להוצאה, הקוד קורא ל-`expenseService.createExpenseJournalEntry` — כלומר הפקודה
שנוצרת היא פקודת `EXPENSE` רגילה (סעיף 2.1), לא סוג ייעודי לתשלומים.

חשבון `4010` (הכנסות פטורות) **קיים בתרשים החשבונות אך אף פעם לא נזקף אליו בפועל** — כל הכנסה
נרשמת תמיד ל-`4000`, ללא קשר לסטטוס העוסק. כתוצאה מכך, `nonVatableTurnover` בדוח המע"מ
מהיומן (`createVatReportFromJournal`) תמיד יוצא 0 בפועל.

---

## 3. הטבלאות הקיימות ותפקידן

| טבלה | ישות (Entity) | תפקיד |
|---|---|---|
| `journal_entry` | `JournalEntry` | כותרת פקודת יומן: מספר רץ (`entryNumber`), תאריך, תיאור, `referenceType`/`referenceId` (המסמך/הוצאה המקור), `vatReportingPeriod`, `counterPartyName`, `documentTotal`, `firebaseId` (בעלים) |
| `journal_line` | `JournalLine` | שורות הפקודה: `accountCode`, `debit`/`credit`, `amountBeforeVat`, `vatAmount`, `taxPercent`/`vatPercent`, `amountForTax` (הסכום שנכנס בפועל לדוח רו"ה/מע"מ), `isEquipment`, `subCategoryName` |
| `default_booking_account` | `DefaultBookingAccount` | תרשים החשבונות הגלובלי (25 כרטיסים כרגע): `code`, `name`, `type` (asset/liability/equity/income/expense), `pnlCategory` (שם השורה בדו"ח רו"ה, `NULL`=כרטיס טכני), `displayOrder` |
| `default_category` | `DefaultCategory` | קטגוריות הוצאה גלובליות (קטלוג המערכת). כוללת `accountCode` — ברירת מחדל ברמת קטגוריה |
| `default_sub_category` | `DefaultSubCategory` | תתי-קטגוריה גלובליים. כוללת `accountCode` ו-`pnlCategory`, `taxPercent`, `vatPercent`, `isEquipment`, `isRecognized` |
| `user_category` | `UserCategory` | דריסת קטגוריה ברמת משתמש/עסק (`accountCode` אישי) |
| `user_sub_category` | `UserSubCategory` | דריסת תת-קטגוריה ברמת משתמש/עסק (`accountCode`, `pnlCategory` אישיים) |
| `expense` | `Expense` | שורת הוצאה בפועל. מחזיקה `journalEntryNumber` — מצביע לפקודת היומן שנוצרה עבורה |
| `documents` | `Documents` | מסמך שהופק (קבלה/חשבונית/זיכוי). מחזיקה `journalEntryNumber` ו-`journalEntryId` — קישור לפקודת היומן |
| `business` | `Business` | פרטי העסק, כולל `businessType` (`EXEMPT`/`LICENSED`/...) — המקור היחיד לקביעת עוסק פטור/מורשה |

---

## 4. הקשר בין קטגוריה ← תת-קטגוריה ← כרטיס ← שורה בדו"ח רו"ה

כשנוצרת הוצאה, נקבע קוד הכרטיס שלה דרך `resolveAccountCode` (`expenses.service.ts:877`),
**לפי סדר עדיפות מדויק** (הראשון שנותן תוצאה — קובע, גם אם שלב "כללי" יותר מאוחר ברשימה קיים):

```
1. user_sub_category   — דריסה אישית ברמת תת-קטגוריה (businessNumber + firebaseId + קטגוריה + תת-קטגוריה)
2. default_sub_category — קטלוג גלובלי ברמת תת-קטגוריה
3. user_category       — דריסה אישית ברמת קטגוריה
4. default_category    — קטלוג גלובלי ברמת קטגוריה
5. '5000' (הוצאות בלתי מזוהות) — נפילת ברירת מחדל, אם שום דבר לא נמצא
```

⚠️ שימו לב לסדר: **`default_sub_category` (גלובלי) קודם ל-`user_category` (אישי)**. כלומר תת-קטגוריה
גלובלית עם `accountCode` תגבר על דריסת-קטגוריה אישית של המשתמש, גם אם לכאורה "אישי" נשמע יותר
ספציפי. זו התנהגות מכוונת בקוד הקיים, לא באג — אבל שווה לדעת אם עורכים משתמשים בדריסות אישיות.

לאחר שנקבע `accountCode` (למשל `'5200'`), הוא נשמר על שורת היומן (`journal_line.accountCode`).
דוח רווח והפסד מהיומן (`createPnLReportFromJournal`, `reports.service.ts:645`) עושה:

```
JOIN journal_line ON journal_line.accountCode = default_booking_account.code
WHERE default_booking_account.pnlCategory IS NOT NULL AND journal_line.isEquipment = false
GROUP BY default_booking_account.pnlCategory
```

**כלומר: העמודה/שורה שתופיע בדו"ח רו"ה היא שדה `pnlCategory` על הכרטיס (`default_booking_account`),
לא שם הקטגוריה או תת-הקטגוריה עצמם.** כמה תתי-קטגוריה/קטגוריה שונים יכולים "להתכנס" לאותה שורה
בדו"ח אם הם ממופים לאותו כרטיס (למשל ארנונה, חשמל, ועד-בית, שכירות-משרד — כולם ממופים לכרטיס
`5100` שה-`pnlCategory` שלו הוא "הוצאות משרד", ולכן כולם מופיעים כשורה אחת מאוחדת).

כרטיסים עם `pnlCategory = NULL` (הכרטיסים הטכניים `1000`–`2410`) **אף פעם לא מופיעים כשורה
בדו"ח** — הם מסוננים החוצה ע"י `WHERE pnlCategory IS NOT NULL`.

הכנסה (`4000`/`4010`) לא מפוצלת לפי `pnlCategory` בדו"ח — היא תמיד מסוכמת לשורת "סה״כ הכנסות"
אחת, ללא קשר לערך ה-`pnlCategory` שלה.

⚠️ **פער שנמצא בבדיקה**: לשדה `displayOrder` על `default_booking_account` **אין כיום שום צרכן** —
לא ב-backend (`createPnLReportFromJournal` לא ממיין לפיו כלל) ולא ב-frontend. שורות הדו"ח
מופיעות כרגע לפי סדר הכנסה טבעי ל-Object (לא מסודר בכוונה). אם רוצים סדר תצוגה קבוע לפי
`displayOrder`, יש להוסיף `.sort()` בקוד — זה כרגע לא ממומש.

---

## 5. איך מוסיפים כרטיס חדש ("כרטיס") למערכת

**אין כיום ממשק ניהול (UI) או endpoint ל-API להוספת/עריכת כרטיס בזמן ריצה.**
`bookkeeping.controller.ts` קיים אך ריק לחלוטין — מזריק את השירות בלי אף route.

הדרך היחידה: לערוך את המערך `DEFAULT_ACCOUNTS` בקובץ
`backend/src/bookkeeping/account.seed.ts`, ולפרוס (deploy) מחדש. הוספת שורה:

```ts
{ code: '5450', name: 'שם הכרטיס', type: 'expense', pnlCategory: 'שם השורה בדו"ח', displayOrder: 6.5 },
```

- `code` — ייחודי, זה מפתח ה-upsert.
- `type` — `'asset' | 'liability' | 'equity' | 'income' | 'expense'`.
- `pnlCategory` — `null` לכרטיס טכני שלא אמור להופיע בדו"ח רו"ה, אחרת שם השורה בדו"ח.
- `displayOrder` — כרגע לא בשימוש בפועל (ראו סעיף 4), אבל מומלץ למלא לעתיד.

בעת עליית השרת (**בכל סביבה, כולל production** — `AccountSeedService.onModuleInit()` רץ תמיד,
ללא תלות ב-`NODE_ENV`), הרשומה תוזרק/תעודכן אוטומטית ב-`default_booking_account` דרך
`accountRepo.upsert(DEFAULT_ACCOUNTS, ['code'])`. **עריכה ידנית של שורה קיימת ישירות ב-DB
תידרס בעליית השרת הבאה** — יש לערוך רק בקובץ המקור.

אחרי הוספת כרטיס הוצאה חדש, כדי שהוצאות ינותבו אליו בפועל יש גם למפות תתי-קטגוריה/קטגוריה
אליו — דרך הוספת כללים ב-`PNL_CATEGORY_TO_ACCOUNT`, `CATEGORY_ACCOUNT_DEFAULTS`, או
`SUBCATEGORY_KEYWORD_RULES` ב-`account-seed.service.ts` (ראו סעיף 4 להסבר על סדר העדיפויות).

---

## 6. מה נשאר כדי ליישם הנהלת חשבונות כפולה מלאה

חשוב להבהיר: המערכת **כן** עושה רישום כפול מאוזן לכל פקודה (חובה=זכות בכל פקודה בודדת), וה"כרטסת"
(דו"ח יתרות לפי כרטיס, כולל יתרת פתיחה/סגירה) **כבר קיימת** (`createLedgerReport`, עמוד
`ledger-report` בפרונט). מה שחסר הוא היקף מלא של מערכת הנה"ח דו-צדית עסקית:

| נושא | מצב היום |
|---|---|
| **מאזן בוחן (Trial Balance)** | לא קיים — אין endpoint/שירות שמחשב אותו |
| **מאזן (Balance Sheet)** | לא קיים. **אין אף כרטיס מסוג `equity`** בתרשים החשבונות בפועל (הטיפוס קיים ב-TS אך לא נעשה בו שימוש) — בלי הון עצמי/רווח שנצבר, לא ניתן להפיק מאזן מאוזן |
| **כרטסת לפי כרטיס (General Ledger)** | ✅ **קיים** — `createLedgerReport`, כולל יתרת פתיחה מחושבת ויתרה רצה |
| **יתרות פתיחה (Opening Balance)** | הערך `OPENING_BALANCE` הוגדר ב-enum אך **אין שום קוד שמשתמש בו** — אין דרך להזין יתרת פתיחה לעסק חדש שמצטרף עם היסטוריה |
| **פקודת יומן ידנית** | קיים סקאפולד ב-frontend (`ledger-report.page.ts`) — הפונקציה `saveJournalEntry()` היא **stub** שרק מדפיסה ל-console; **אין endpoint ב-backend** ליצירת פקודה ידנית. `JournalReferenceType.MANUAL` לא בשימוש |
| **סגירת תקופה/שנה (Period Closing)** | לא קיים מושג. "סימון דוח כמוגש" (`markReportAsSubmitted`) נועל שורות תנועה לפי תקופת דיווח — זו נעילת מקור, לא סגירת שנה חשבונאית (איפוס הכנסות/הוצאות לרווח נצבר) |
| **מטבע חוץ על היומן** | `journal_entry`/`journal_line` אין להם עמודת מטבע — הכל נשמר בש"ח בלבד; המרה מתבצעת לפני יצירת הפקודה. הכרטסת מציגה נתוני מטבע חוץ רק לצורך תצוגה, דרך JOIN חוזר לטבלת `documents` |
| **הבחנה בין אמצעי תשלום (1100/1110/1120)** | שלושת הכרטיסים קיימים בתרשים אך רישום הוצאות מקבע תמיד ל-`1100` (בנק); `1110` (מזומן) ו-`1120` (אשראי) לא נזקפים אליהם בפועל היום |
| **ספקים / הקפה (`2000`)** | כרטיס קיים אך לא בשימוש — כל הוצאה נרשמת כאילו שולמה מיידית, אין מודל של חוב לספק |
| **הכנסות פטורות (`4010`)** | כרטיס קיים אך לא בשימוש — כל הכנסה נרשמת ל-`4000` ללא קשר לסוג העוסק, מה שגורם ל-`nonVatableTurnover` בדוח המע"מ מהיומן להיות תמיד 0 |
| **פחת (`6300`) — רישום אוטומטי** | דוח טופס 1342 (פחת) מחושב **בנפרד**, ישירות מטבלת `Expense` (`isEquipment=true`), ולא מהיומן — אין משימת רקע/job שמפרסמת פקודת פחת שנתית אוטומטית לכרטיס `6300` |
| **ניהול תרשים חשבונות** | אין ממשק ניהול/API — רק קוד + פריסה מחדש (סעיף 5) |
| **מיון `displayOrder` בדו"ח רו"ה** | השדה קיים על הכרטיס אך לא ממומש בקוד הדוח בפועל (ראו סעיף 4) |
| **`PAYMENT` / `VAT_PAYMENT` / `ADJUSTMENT`** | מוגדרים ב-enum, **לא בשימוש בשום מקום** בקוד. תנועות בנק שהופכות להוצאה נרשמות כ-`EXPENSE` רגיל, לא כ-`PAYMENT` ייעודי |

**סדר עדיפות מוצע (לא התבקש, אך רלוונטי):** אם המטרה היא הנה"ח כפולה "אמיתית" ולא רק כרטסת
תומכת-דוחות, נראה שהצעדים הכי משמעותיים הם (1) הוספת כרטיס הון/רווח נצבר + מסך מאזן, (2)
מימוש `OPENING_BALANCE` בפועל כדי לאפשר קליטת עסק קיים, ו-(3) חיבור ה-endpoint החסר לפקודה
ידנית (ה-frontend כבר מוכן לזה).

---

## מקורות (לצורך אימות/עדכון עתידי)

- `backend/src/bookkeeping/bookkeeping.service.ts`, `bookkeeping.controller.ts`, `account.seed.ts`, `account-seed.service.ts`, `account.entity.ts`, `jouranl-entry.entity.ts`, `jouranl-line.entity.ts`
- `backend/src/expenses/expenses.service.ts` (`resolveAccountCode`, `buildExpenseJournalLines`, `createExpenseJournalEntry`, `syncExpenseJournalEntry`)
- `backend/src/documents/documents.service.ts` (`buildDocumentJournalLines`, `createDoc`, `finalizeAllocation`)
- `backend/src/reports/reports.service.ts` (`createPnLReportFromJournal`, `createVatReportFromJournal`, `createLedgerReport`, `getJournalEntryDetail`)
- `backend/src/enum.ts` (`JournalReferenceType`, `BusinessType`, `isExemptBusinessType`)
- `backend/src/business/business.entity.ts`
- `frontend/src/app/pages/ledger-report/ledger-report.page.ts`

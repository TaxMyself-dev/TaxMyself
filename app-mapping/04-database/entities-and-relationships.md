# ישויות וקשרים מרכזיים

הטבלה מבחינה בין **קשר TypeORM מפורש** לבין **קשר לוגי** שממומש באמצעות מזהים ושירותים. היא אינה ERD של DB חי. מקורות הם `*.entity.ts` בתיקיות המצוינות, ובמקומות שצוין גם SQL.

| אשכול | קשר עיקרי | אכיפה/הערה ומקור |
|---|---|---|
| זהות ועסק | User → Business באמצעות `firebaseId` | לוגי; `Business.businessNumber` unique; `backend/src/users/user.entity.ts`, `backend/src/business/business.entity.ts` |
| ייצוג | User בעלים ← Delegation → User מייצג | מזהי Firebase; unique על agent+user ועל agent+externalCustomerId; status ו־scopes; `backend/src/delegation/delegation.entity.ts` |
| חשבונות בנק/כרטיס | User → Bill → Source | יחסי TypeORM; Source ייחודי על משתמש+סוג+שם+תפקיד חיבור; `backend/src/transactions/{bill,source}.entity.ts` |
| תנועות | Source → FullTransactionCache / UserSourceSyncState | relations מפורשים לפי `sourceRecordId`; slim/cache מקושרים לוגית דרך user+externalTransactionId; `backend/src/transactions/` |
| כללי סיווג | ClassifiedTransactions → תנועות/קטלוג | התאמת משתמש, חשבון, merchant ותנאים; אינה FK לכל תנועה; `backend/src/transactions/classified-transactions.entity.ts` |
| קטלוג | Category ← SubCategory → BookingAccount → AccountingSection | `ManyToOne/JoinColumn` מפורשים; account nullable; uniqueness לכל שכבת בעלות; `backend/src/bookkeeping/` |
| הוצאה | Expense → SubCategory | `subCategoryId` הוא scalar ב־entity; FK מפורש נכלל ב־cutover.sql, לא decorator relation ב־Expense; החלה בפועל לא אומתה |
| עקבות מקור | Expense → ExtractedDocument / תנועה | `sourceDocumentId` ו־`externalTransactionId` הם מצביעים לוגיים; `backend/src/expenses/expenses.entity.ts` |
| יומן | JournalEntry → JournalLine | קישור scalar של `journalEntryId`; header ושורות נכתבים יחד בשירות; אין relation decorator בשתי הישויות; `backend/src/bookkeeping/jouranl-entry.entity.ts`, `jouranl-line.entity.ts` |
| מקור היומן | JournalEntry → Expense / Documents | צמד polymorphic של `referenceType/referenceId`; מספור תצוגה `entryNumber` שונה מ־PK הגלובלי; אותם מקורות |
| כרטיס בשורה | JournalLine → BookingAccount | קישור דרך קוד והקטלוג האפקטיבי בשאילתות; `accountCode` לבדו אינו מזהה גלובלי; `backend/src/reports/reports.service.ts` |
| מסמך עסק | Documents → DocLines / DocPayments | מזהים מפורשים במודל; uniqueness למסמך לפי עסק+סוג+מספר; `backend/src/documents/` |
| קליטת קובץ | ImportedDocument → Drive / מקור קליטה | תוכן ייחודי לפי משתמש+עסק+contentHash; `backend/src/document-import/entities/imported-document.entity.ts` |
| OCR והתאמה | ExtractedDocument ↔ תנועה / מסמך נוסף | מזהי התאמה, `pairedWithDocumentId`, וחלוקת קובץ; relations לוגיים; `backend/src/documents/extracted-document.entity.ts` |
| פחת | AssetDepreciationPosting → Expense | FK TypeORM עם cascade למחיקת הוצאה; רישום הוצאה+שנה ייחודי; `backend/src/depreciation/asset-depreciation-posting.entity.ts` |
| דיווח | ReportWorkflow / AccountantTask → עסק ותקופה | מפתחות unique עסק+סוג+תחילת/סוף תקופה; סטטוס משימה נפרד מהספר החשבונאי; `backend/src/report-workflow/`, `backend/src/accountant-tasks/` |
| דוח שנתי | AnnualReport → AnnualReportFile | מזהה דוח; unique עסק+שנת מס; `backend/src/annual-report/` |
| חיוב | Subscription → BillingObligation → BillingAttempt | קשרי TypeORM; חוב וניסיון נפרדים, מספר ניסיונות לאותו חוב; `backend/src/billing/entities/` |
| שיוך גבייה | BillingAttempt ↔ BillingObligation | `BillingAttemptObligation` עם PK מורכב ו־FK מסוג RESTRICT; ניסיון אחד יכול ליישב מספר חובות |
| קבלה ושירות חיוב | BillingAttempt ↔ Documents; BillingEvent → ניסיון/חוב | קשרי FK ואינדקסי unique למניעת כפל קבלות; PaymentMethodUpdateAttempt הוא מסלול שמירת אמצעי תשלום נפרד מגבייה |
| אינטגרציות | UserIntegration / OauthState / InboundEmailAddress → משתמש ועסק | מצב חיבור, חד־פעמיות OAuth וכתובת קליטה; לא הרשאת קריאה כללית לנתוני העסק; `backend/src/integrations/entities/`, `backend/src/inbound-email/` |
| SHAAM | ShaamConnection / ShaamOauthState / UniformFileSubmission → Business | FK ל־`business_id`; חיבור ייחודי לפי עסק+מוצר+סביבה; `backend/src/shaam/entities/` |

## משמעות ליועץ AI

נתוני מקור, הצעת סיווג, הוצאה מאושרת ופקודת יומן הם אובייקטים נפרדים. אי אפשר לבחור טבלה אחת כ״כל האמת הפיננסית״: להקשר בנקאי משתמשים בתנועות; להסבר מסמך במקור וב־OCR; להחלטה מאושרת ב־Expense snapshots; לדוח חשבונאי ביומן.

שאילתת AI עתידית תצטרך להפעיל את הקשר המשתמש והעסק והקטלוג האפקטיבי לפני איחוד הנתונים. אין לראות ב־FK או במזהה קובץ הרשאת גישה. שדות חוק מס נוכחיים בכרטיס אינם בהכרח החוקים שהוחלו על אירוע עבר; לשם כך קיימים snapshots ושורות היומן. זו מסקנה מן המודל, לא תשתית AI מיושמת.

## מגבלת האימות

הקשרים המפורשים נבדקו ב־decorators והקשרים הלוגיים בקוד המודל/שירותים מרכזיים. לא נבדק DB חי; במיוחד ה־FK של Expense→SubCategory מוגדר בסקריפט SQL מחוץ למטא־דאטה של Expense. לפיכך בדיקת ORM בלבד אינה מוכיחה את הסכימה בפועל, והפעלת synchronize אינה תהליך אימות בטוח.

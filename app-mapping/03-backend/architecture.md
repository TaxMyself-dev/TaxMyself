# ארכיטקטורת Backend

מיפוי סטטי של הקוד, 20.10.2026. **ממומש** משמעו מסלול קוד פעיל; אין בכך אישור להפעלה או לפריסה בייצור.

## מבנה וריצה

השרת הוא מונולית מודולרי ב־NestJS/TypeScript עם Express ו־TypeORM/MySQL. `AppModule` מחבר את מודולי המוצר, מגדיר במפורש את ישויות מסד הנתונים ומאתחל Firebase Admin. מסמכים, הוצאות, בנקאות, דיווח וחיוב חולקים תהליך ומסד נתונים; רינדור PDF יכול להתבצע בשירות `pdf-service` נפרד דרך HTTP. Controllers מנתבים REST; Services מרכזים חוקים עסקיים וניגשים ל־Repositories או ל־QueryBuilder. חלק מהמודולים מספקים שוב Services שמשמשים מודולים אחרים, ולכן גבולות ה־DI אינם הפרדה מלאה בין תחומים.

מקורות: `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/package.json`, `backend/src/documents/documents.module.ts`.

`main.ts` מחיל `ValidationPipe` עם `whitelist` ו־`transform`, מסנן חריגות גלובלי ו־CORS, ומגדיר parsing נפרד לנתיבי `/agent`, Feezback ו־Mailgun. שמירת גוף גולמי נדרשת למסלולי אימות חתימות; עצם קיום middleware אינו מוכיח endpoint פעיל או אבטחה מספקת. אין ב־AppModule הגדרת Guard גלובלי שמגן אוטומטית על כל route: יש לבדוק decorators והגנות שירות בכל Controller.

## מרכזי אחריות

| מרכז | אחריות | סטטוס ומקור |
|---|---|---|
| זהות והקשר | משתמש Firebase, משתמש אפקטיבי, עסק, ייצוג ומנוי | ממומש — `guards/`, `users/`, `delegation/`, `billing/` תחת `backend/src/` |
| קליטת מידע | בנקאות, Gmail, Mailgun ו־Drive; מניעת כפילות ומצב סנכרון | ממומש — `transactions/`, `integrations/`, `inbound-email/`, `document-import/` |
| החלטה חשבונאית | סיווג, קטלוג, snapshot, אישור ופקודת יומן | ממומש — `expenses/expenses.service.ts`, `bookkeeping/catalog.service.ts`, `bookkeeping/bookkeeping.service.ts` |
| תוצר עסקי | מסמכים מופקים, דיווח מע״מ/רווח והפסד/ספר ראשי/פחת וקובץ אחיד | ממומש בקוד — `documents/`, `reports/`, `depreciation/`; הגשה חיצונית תלויה בתצורה ובהרשאות |
| תפעול | משימות רו״ח, תהליכי דיווח, דוח שנתי, חיוב, admin ודמו | ממומש — המודולים המקבילים ב־`backend/src/` |

## גבול העסקה החשבונאית

באישור הוצאה נפתר הקטלוג האפקטיבי, מועתקים חוקי הכרטיס ל־Expense ונכתבים header ושורות יומן באותה עסקת SQL. `addExpense` מקבל `EntityManager` של הקורא או פותח עסקה בעצמו; כך מסלול אישור מסמך יכול לכלול את יצירת ההוצאה בעסקה שלו. `BookkeepingService` מנהל כתיבה והחלפת שורות ומספור עסקי. פעולות Drive, OCR, דוא״ל וספקי תשלום הן מחוץ לגבול העסקה של MySQL; אין להסיק אטומיות בין DB לשירות חיצוני.

חריג שימושי: `completeExpenseMapping` מתעד במפורש ששינוי המיפוי לעתיד יכול להתחייב לפני עסקת ההוצאה. כישלון בהמשך אינו מבטל בהכרח את עדכון הקטלוג. מקור: `backend/src/expenses/expenses.service.ts`.

דוחות חשבונאיים נקראים בעיקר מן היומן; ניתוח תזרים קורא מודל תנועות/cache. אלה אינם אותו מדד. דוח רווח והפסד מצרף חשבונות ו־`AccountingSection`; אין להסתמך על הערות ישנות שמתארות `pnlCategory` כמנגנון המרכזי. מקורות: `backend/src/reports/reports.service.ts`, `backend/src/transactions/transaction-processing.service.ts`.

**מגבלה מאומתת:** מודל היומן כולל debit/credit, אך `persistJournalEntry` אינו בודק במרכז שסכום החובה שווה לסכום הזכות. בוני השורות במסלולים שנבדקו מייצרים חשבון נגדי; `buildDocumentJournalLines` מבדיל קבלה, חשבונית, חשבונית־קבלה וזיכוי ומחזיר null לסוגים אחרים. לכן אין להציג את כל סוגי המסמכים ככאלה שמייצרים יומן, או להבטיח אכיפת איזון אוניברסלית. בנוסף, ב־persistJournalEntry חיפוש החשבון הוא לפי `code` בלבד, אף שהייחוד במודל הוא `chartOwnerKey+code`; אין להסיק שהשכבה הזו לבדה מבצעת resolution מלא של קטלוג אפקטיבי. מקורות: `backend/src/bookkeeping/bookkeeping.service.ts`, `backend/src/documents/documents.service.ts`.

## עבודות רקע וסכימה

`ScheduleModule.forRoot()` מפעיל עבודות מתוזמנות בתוך השרת. מצבי sync, ניסיונות חיוב, OAuth ומסמכים נשמרים ב־DB; זו אינה הוכחה לתור משימות חיצוני או לעובד נפרד. פירוט ב־`app-mapping/05-integrations/background-jobs.md`.

TypeORM `synchronize` מופעל רק כאשר `NODE_ENV !== 'production'` וגם `DISABLE_SYNCHRONIZE !== 'true'`; guard חוסם הפעלה שלו על שם DB המכיל `prod`. כלי `start:watch` משבית אותו כברירת מחדל. `CatalogSeedService` הוא create-only ומכבד `SKIP_BOOT_SEED`; הוא עדיין עשוי ליצור נתוני קטלוג בהפעלה. שינויי production מתועדים בסקריפטי SQL ידניים וב־`docs/redesign/cutover.sql`, לא במסלול migrations אוטומטי שמוגדר ב־AppModule.

**לא אומת:** מספר מופעי השרת, תזמון בפועל בין מופעים, תצורת production, סכימה חיה ותוצאות דיווח אמת. לא הופעל שרת ולא נפתח חיבור DB.

## תוספת AI-DEV, טרם מוזגה

מקור: `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. שם `AppModule` מחבר `AiChatModule` ו־session entity. `AiChatController → ConversationTurnService → AiChatService` מפריד HTTP, זיכרון/נעילת תור, ותזמור מודל וכלים. ארבעה readers מוגבלים קוראים הוצאות ותנועות או קטלוג; אין הפעלת פעולות אישור או שינוי יומן. provider-neutral gateway ו־Anthropic adapter נפרדים ממסלול OCR של MAIN.

מקורות AI-DEV: `backend/src/app.module.ts`, `backend/src/ai-chat/ai-chat.module.ts`, `backend/src/ai-chat/ai-chat.service.ts`, `backend/src/ai-chat/session-store/conversation-turn.service.ts`. חוזי accounting/cashflow רחבים קיימים אך readers מלאים אינם מחוברים. [מפת הפיתוח](../06-ai/development-ai-chat.md) מפרטת את המימוש והמגבלות; יתר מסמך זה משמר את MAIN.

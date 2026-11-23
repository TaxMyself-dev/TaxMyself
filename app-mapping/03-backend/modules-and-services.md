# מודולים ושירותים מרכזיים

כל הנתיבים בטבלה יחסיים ל־`backend/src/`. הסטטוס הוא **ממומש בקוד**, אלא אם צוין אחרת. החיבור ליישום נבדק ב־`app.module.ts`; מסמכי התחום משמשים הקשר בלבד.

| תחום ומימוש | מה המשתמש מקבל | מודל וקשרים חשובים |
|---|---|---|
| `users/users.service.ts`, `business/business.service.ts` | רישום, פרופיל, עסקים והגדרות מס, הקצאת מבנה Drive | `User`, `Child`, `Business`; Firebase ו־Google Drive |
| `delegation/delegation.service.ts` | הזמנת מייצג, ייצוג פעיל, יצירת לקוח בידי רו״ח והסרת קשר | `Delegation`, `User`, `Business`; דוא״ל ו־Firebase; הסרת קשר אינה מחיקת הלקוח |
| `clients/clients.service.ts` | ספר הלקוחות של העסק לצורך מסמכים | `Clients`; שונה מלקוחות רו״ח ב־Delegation |
| `expenses/expenses.service.ts` | הוצאות ידניות/מבנק/ממסמך, ספקים, קטלוג, אישור וסיווג מחדש | `Expense`, `Supplier`, הקטלוג והיומן; snapshots ונעילת תקופה |
| `bookkeeping/catalog.service.ts`, `catalog-context.service.ts`, `account-code-allocator.service.ts` | קטלוג לקוח/רו״ח/מערכת, כרטיסים, השלמת מיפוי ויצירת וריאנט חוק מס | `Category`, `SubCategory`, `BookingAccount`, `AccountingSection`; אין חוק מס נפרד על SubCategory |
| `bookkeeping/bookkeeping.service.ts`, `bookkeeping.controller.ts`, `admin-booking-accounts.controller.ts` | פקודות יומן אוטומטיות וידניות, קטלוג מקצועי וניהול כרטיסי מערכת | `JournalEntry`, `JournalLine`; Controller קיים גם אם תיעוד ישן טוען שאין routes |
| `transactions/transactions.service.ts`, `transaction-processing.service.ts`, `user-sync-state.service.ts` | יבוא תנועות, סיווג ידני/כללים, אישור להוצאות וניתוח תזרים | `Bill`, `Source`, slim/cache, כללי סיווג ו־sync; Feezback ושערי BOI |
| `documents/documents.service.ts` ושירותי `documents/` | הפקת מסמכי עסק; קליטה, OCR, התאמה לתנועה ובדיקה לפני אישור | `Documents`, `DocLines`, `DocPayments`, `SettingDocuments`, `ExtractedDocument`; Drive, ספקי AI ו־SHAAM לפי הפעולה |
| `document-import/`, `integrations/`, `inbound-email/` | קליטת קבצים מ־Gmail/דוא״ל נכנס לתהליך מסמכים משותף | `ImportedDocument`, `UserIntegration`, `OauthState`, `InboundEmailAddress`; Google ו־Mailgun |
| `reports/reports.service.ts` | מע״מ, מקדמות, רווח והפסד, ספר ראשי, פחת וקובץ אחיד | יומן, כרטיסים, חתכים, עסקים והוצאות; תזרים אינו תחליף לדוח יומן |
| `depreciation/` | חישוב ורישום פחת ציוד | `Expense`, `AssetDepreciationPosting`, יומן; מועד הפעלה נפרד מתאריך רכישה |
| `report-workflow/` | מצב חובת דיווח והגשה/נעילת התקופה | `ReportWorkflow`; מתאם עם הוצאות ותנועות נעולות |
| `accountant-tasks/`, `annual-report/` | רשימת משימות רו״ח, שאלון וקבצי דוח שנתי | `AccountantTask`, `AnnualReport`, `AnnualReportFile`; סיום תהליך אינו כשלעצמו הוכחת הגשה לרשות |
| `billing/services/` | מסלולים, trial, מודולים, תשלום, חידוש, חובות, ניסיונות גבייה וקבלות | `Subscription*`, `BillingObligation`, `BillingAttempt`, `PaymentMethod`, `BillingEvent`; CardCom; נפרד מהוצאות הלקוח |
| `feezback/`, `shaam/`, `google-drive/`, `mail/` | מתאמי בנקאות, הקצאה/הרשאות רשות המסים, אחסון ודוא״ל | Feezback, SHAAM, Drive, Brevo; קוד אינטגרציה אינו מאמת זמינות חשבון או הרשאה חיה |
| `shared/`, `cities/` | תקופות דיווח, מספור, שערים ונתוני ערים | `FxRate` ונתוני עזר; תשתית משותפת למספר תחומים |
| `demo-data/`, `notifications/` | הדגמה ואיתותים על מצב תהליך | דמו ממומש; Notifications הוא חלקי: לוגים, ללא הוכחה לשירות push למשתמש |
| **AI-DEV בלבד:** `ai-chat/` | צ׳אט עברי, כלי קריאה להוצאות וקטלוג, זיכרון זמני | `AiChatModule`, `AiChatService`, `ChatReadToolRegistry`, `AiChatSessionEntity`; Anthropic gateway; views חשבונאיים מלאים אינם מחוברים |

שורת AI-DEV מקורָה ב־`C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`; נתיב `ai-chat/` יחסי ל־`backend/src/` שם. שאר הטבלה משמרת את MAIN. ראו [מפת פיתוח AI Chat](../06-ai/development-ai-chat.md).

## נקודות שהיועץ צריך לזכור

- חיוב KeepInTax הוא מודל מנוי וחוב של הפלטפורמה. מסמכי ההכנסה והוצאות העסק הם ספרי הלקוח. קישור קבלה לניסיון חיוב אינו מערבב בעלות על ספרי לקוחות.
- OCR/הצעת סיווג אינם אישור חשבונאי. ההכרעה נעשית במסלולי review/approve והקטלוג; לפרטי AI ראו `app-mapping/06-ai/document-ai.md`.
- `backend/src/users/auth.service.ts` הוא stub קטן; אין להסיק ממנו מערכת אימות עצמאית. המימוש המהותי נמצא ב־Guards וב־Firebase.
- יש שאריות legacy: `Transactions` וארבע ישויות קטלוג ישנות עדיין רשומות ב־TypeORM. מסלולי הסיווג הפעילים עוברים ב־CatalogService וב־slim/cache; ניקוי מלא אינו עובדה מוגמרת.
- כיסוי כל controller והרשאותיו לא נבחן כבדיקת חדירות. ההגנות המרכזיות מתוארות ב־`authentication-and-authorization.md`.

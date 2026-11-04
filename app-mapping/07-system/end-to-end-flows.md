# מסלולים בין שכבות המערכת

הפירוט העסקי נמצא ב־[תהליכים עסקיים](../01-product/business-workflows.md). כאן מרוכזים החיבורים החשובים למחקר טכני.

הטבלה להלן משמרת MAIN. **מסלול נוסף ב־AI-DEV:** שאלה ב־`AiChatComponent` → controller מאומת → טעינת/נעילת session → ניתוח מודל ובחירת עסק → registry של כלי spending/catalog → SQL קבוע או CatalogService → ראיות, ניסוח וסקירת תשובה → שמירת transcript/context. אין אישור הוצאה או רישום ביומן במסלול זה. מקור: `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`; `backend/src/ai-chat/`, `frontend/src/app/components/ai-chat/`. ראו [הפירוט והמגבלות](../06-ai/development-ai-chat.md).

| טריגר בממשק | גבול שרת מרכזי | תוצאה מתמשכת | מה אינו משתמע מהתוצאה |
|---|---|---|---|
| העלאת קובץ / סריקת inbox | `DocumentsService` → `DocumentProcessorService` | Drive + `ExtractedDocument` | עדיין אין הוצאה מאושרת |
| Gmail / webhook דואר נכנס | integrations/inbound-email → `DocumentImportService` | `ImportedDocument` + קובץ ב־Drive | קליטה מוצלחת אינה חילוץ או אישור |
| סנכרון בנק | Feezback → `TransactionProcessingService` | slim + cache + sync states | תנועה מסווגת אינה פקודת יומן |
| בדיקת חומר לדוח | `ReportReviewService` → `MatchingService` | קישורי התאמה והצגת החלטות ממתינות | התאמה אינה אישור חשבונאי |
| אישור הוצאה | `ReportReviewService` / transactions → `ExpensesService` → `BookkeepingService` | `Expense` + snapshot + `JournalEntry/Line` | לא נשלח דוח לרשות |
| תיוק חומר שנתי | `fileDocumentAsAnnual` | סוג ומצב של `ExtractedDocument` | אינו מוסיף `AnnualReportFile` |
| הפקת מסמך | `DocumentsService.createDoc` | מסמך, פריטים, תשלומים, מספור, קבצים ויומן לפי סוג | לא כל סוג מסמך מפיק הכנסה |
| בקשת הקצאה | SHAAM allocation/recovery → finalization | מספר הקצאה על המסמך והשלמת ההפקה | נדרש חיבור מוצר וסביבה מתאימים |
| דוח מע״מ/רווח והפסד | `ReportsService` | תוצאת חישוב / יצוא | override לתצוגה אינו בהכרח שינוי ביומן |
| סימון כדווח | `ReportWorkflowService.setReported` | מצב, משימות, נעילות, ניסיון snapshot | אינו אישור קליטה ברשות המסים |

## גבולות עקביות

אישור הוצאה משתמש ב־`EntityManager` משותף לשמירת הוצאה ויומן. מספור פקודות הוא לפי עסק, בעוד ה־PK של הפקודה גלובלי. מחיקה של הוצאה פתוחה מסירה גם יומן באותה טרנזקציה; שינוי תקופה שכבר דווחה נחסם. אין לפרש זאת כהבטחה שכל side effect חיצוני אטומי.

ב־`ReportWorkflowService.setReported` מצב הדוח נשמר לפני השלמת תופעות הלוואי, ו־PDF הוא best-effort. ניסיון חוזר למצב REPORTED מריץ שוב נעילה; זו התנהגות התאוששות נקודתית, לא הוכחה ל־exactly-once לכל התהליך. במסלול השנתי גם השמירה, סנכרון המשימות והנעילות מופעלים ברצף.

מקורות: `backend/src/reports/report-review.service.ts`, `backend/src/expenses/expenses.service.ts`, `backend/src/bookkeeping/bookkeeping.service.ts`, `backend/src/report-workflow/report-workflow.service.ts`, `backend/src/annual-report/annual-report.service.ts`.

# מלאי יכולות מאומת

**מומש** = קיים מסלול קוד פעיל שנבדק סטטית; אין בכך אישור לפריסה. **חלקי** = רק חלק מהיכולת הרחבה קיים. **מתוכנן** = תיעוד כוונה ללא מסלול מלא מאומת. **לא אומת** = דורש סביבת ריצה, תצורת ספק או ראיה נוספת.

| יכולת למשתמש | מצב | מימוש וישויות מרכזיות | תלות חיצונית / גבול |
|---|---|---|---|
| הרשמה וכניסה | מומש | מסכי login/register; `users/auth.service.ts`, `User`, `Business` | Firebase Auth; חיבור חי לא נבדק |
| ניהול לקוחות מסחריים וספקים | מומש | `clients/clients.service.ts`, `expenses/expenses.service.ts`; `Clients`, `Supplier` | בסיס לסוגי מסמכים והוצאות |
| הפקת חשבוניות, קבלות וזיכויים | מומש | doc-create; `DocumentsService.createDoc`; `Documents`, `DocLines`, `DocPayments`, `SettingDocuments`, יומן | PDF, Firebase Storage, FillFaster; SHAAM בהקצאה |
| טיוטה והשלמת מסמך ממתין להקצאה | מומש | `saveDraft`, `finalizeAllocation`; `Documents` ומונים | OAuth ומספר הקצאה שמנוהלים בשרת |
| העלאה וארכיון מסמכים | מומש | my-storage, quick-upload, `DocumentsService`; `ExtractedDocument`, `ImportedDocument` | Drive; מחיקה רכה אינה מחיקת יומן |
| חילוץ וסיווג מסמך | מומש | `DocumentProcessorService.extract`; `ExtractedDocument`, קטלוג | Claude; נדרש אימות אנושי |
| יבוא קבצים מ־Gmail ודואר נכנס | מומש, תלוי תצורה | integrations, inbound-email, document-import | Google OAuth, Gmail, Mailgun, Drive |
| תנועות בנק וכרטיסים | מומש | transactions; Feezback; `Bill`, `Source`, `SlimTransaction`, `FullTransactionCache` | דורש הסכמה וחיבור; cache אינו ספר חשבונות |
| סיווג ידני וכללי סיווג חוזרים | מומש | classify-tran; `TransactionProcessingService`, `ClassifiedTransactions` | כללים דטרמיניסטיים; אינם LLM |
| התאמת מסמך לתשלום ובדיקת הוצאות | מומש | report-review; `MatchingService`, `ReportReviewService` | התאמה לפי סכום ותאריך; אינה הוכחת התאמה בנקאית מלאה |
| הוצאה ידנית, אישור ויומן | מומש | mannual-expense; `ExpensesService`, `BookkeepingService`; `Expense`, `JournalEntry`, `JournalLine` | אישור, snapshots ונעילת תקופה |
| קטלוג מקצועי ומיפוי רו״ח | מומש | booking-account-catalog; `CatalogService`; ארבע ישויות הקטלוג | CLIENT > ACCOUNTANT > SYSTEM |
| מע״מ, רווח והפסד וכרטסת | מומש | מסכי הדוחות; `ReportsService`; יומן, הוצאות וכרטיסים | דוח מחושב אינו בהכרח הגשה לרשות |
| מקדמות מס, פחת וטופס 1342 | מומש | `ReportsService`, מודול depreciation | חישוב ותצוגה; תוקף משפטי לא נבדק במשימה |
| קובץ אחיד | יצירה מומשה; שידור תלוי מסלול ותצורה | uniform-file; `ReportsService.createUniformFile`, מודול shaam | יצוא INI/BKMVDATA ואימות מקומי; ראו פירוט האינטגרציה |
| שיתוף רו״ח, יצירת לקוח ומשימות | מומש | clients-panel; `DelegationService`, `TasksGeneratorService`, `AccountantTask` | Firebase, Drive, דוא״ל לפי מסלול |
| חובות דיווח ואישור סיום תקופה | מומש | `ReportWorkflowService`; `ReportWorkflow`, משימות ונעילות | snapshot PDF למע״מ הוא best-effort; סימון אינו אישור קבלה חיצוני |
| דוח שנתי | חלקי ביחס לתהליך מס מלא | annual-report; `AnnualReportService`, `AnnualReport`, `AnnualReportFile` | שאלון, מסמכים וסטטוס; כרטיס כניסה מוסתר בממשק |
| תיוק OCR כחומר שנתי | חלקי | `DocumentsService.fileDocumentAsAnnual`; `ExtractedDocument` | אינו יוצר `AnnualReportFile` |
| ניתוח תזרים | מומש | flow-analysis; `TransactionProcessingService`, cache | תמונת תנועות; אינה רווח חשבונאי |
| מנויים ותשלומי שירות | מומש עם מסלולים בשלבי מעבר | billing/admin-billing; subscription ו־billing entities | CardCom, מסמכי חיוב; ראו גבולות במסמכי backend ואינטגרציות |
| התראות שיתוף על סטטוס דיווח | חלקי | `NotificationService` | כרגע log; אין להסיק משלוח WhatsApp/email |
| צ׳אט AI, orchestration וזיכרון שיחה | מומש ב־AI-DEV; לא נמצא ב־MAIN | `AiChatModule`, `AiChatService`, `ai_chat_session`, `AiChatComponent` | Anthropic; session זמני, כלי קריאה בלבד; פריסה ואיכות לא אומתו |
| שאלות על הוצאות, דירוג ופירוט | מומש ב־AI-DEV | `ChatReadToolRegistry`, `ChatSpendingQueryService`; Expense + slim/cache | ארבעה readers כולל קטלוג; אינו דוח רווח חשבונאי |
| accounting/cashflow מלאים ו־resolvers שאינם BUSINESS בצ׳אט | חלקי ב־AI-DEV | חוזי views/types קיימים; readers/resolvers מלאים אינם מחוברים | החזרת מגבלת יכולת במקום תוצאה בדויה |
| ניקוי סכמת הקטלוג הישנה | מתוכנן בתוכנית redesign | Phase 7 | ישויות legacy עדיין רשומות; אין להסיק שהסכמה נוקתה |

נתיבי backend בטבלה יחסיים ל־`backend/src/`; שמות המסכים מתייחסים ל־`frontend/src/app/pages/` או לרכיבים המשולבים בהם. כל שורות **AI-DEV** מקורן ב־worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`; קבצי המקור שם הם `backend/src/ai-chat/` ו־`frontend/src/app/components/ai-chat/`. יתר השורות משמרות את MAIN ב־commit שב־README. ראו [מימוש הצ׳אט בפיתוח](../06-ai/development-ai-chat.md). פערי מסכים והוראות ישנות מרוכזים ב־[מגבלות](../07-system/known-limitations.md).

# מגבלות, פערים ושאלות פתוחות

## גבול האימות

מפת הבסיס נבדקה סטטית בתאריך 20.10.2026 מול `main` בבסיס `0a74039bb98c8f4ad94da7565dcc659bc3399aa4`. נוספה בדיקת AI-DEV בקריאה בלבד: `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. לא הופעל היישום, לא הורצו tests/builds, לא נקראו קובצי סודות ולא בוצעה גישה למסדי נתונים או לחשבונות ספקים. נוכחות בדיקות בקוד אינה תוצאת הרצה במשימה זו.

לא אומתו גרסת production, הסכמה בפועל, הפעלת flags, הגדרות OAuth, מספר מופעי שרת, scheduler חיצוני, הרשאות IAM או נתוני שימוש ועלות. אין במסמכים נתוני לקוחות. המיפוי אינו חוות דעת חשבונאית או אישור תאימות לרשות המסים.

## פערים שנצפו בקוד

| נושא | ממצא | משמעות ליועץ |
|---|---|---|
| אכיפת יומן | `persistJournalEntry` אינו מאמת במרכז שוויון חובה וזכות | בוני שורות מספקים איזון במסלולים שנבדקו; אין הבטחת אכיפה אוניברסלית |
| פתרון כרטיס בכתיבה | חיפוש `BookingAccount` ביומן לפי `code` בלבד | הייחוד הוא לפי `chartOwnerKey+code`; אין להסיק בידוד קטלוג מלא מפונקציית הכתיבה |
| תיוק שנתי | `fileDocumentAsAnnual` משנה `ExtractedDocument`; אינו יוצר `AnnualReportFile` | חומר מתויק אינו בהכרח מופיע בתהליך השאלון השנתי |
| חשיפת הדוח השנתי | route קיים, כרטיס הכניסה ב־reports מוסתר עם TODO | תשתית איסוף חומר אינה מוצר הגשת דוח מלא |
| הוספת הוצאה ישנה | `/add-expense` הוא טופס ללא שמירה | להסתמך על הדיאלוג הפעיל, לא על שם מסך |
| guards בנתיבים | `/flow-report` ו־`/add-expense` ללא AuthGuard/BillingGuard ייעודיים ב־routing | אין להסיק מכך גישה אנונימית לנתוני השרת; זו בדיקה נפרדת |
| התראות דיווח | `NotificationService` כותב לוג בלבד | אין ערוץ משלוח משתמש מלא במסלול זה |
| סימון דיווח | מצב, נעילות ומשימות אינם טרנזקציה אחת עם מערכת חיצונית; PDF best-effort | סטטוס פנימי אינו אישור קליטה ברשות או הבטחה לקובץ snapshot |
| התאמה למסמך | `MatchingService` משתמש בסובלנות תאריך וסכום ובהקצאה חמדנית | זו הצעה שימושית; אינה reconciliation מלא או התאמה אופטימלית גלובלית |
| עריכת חומר | `ReviewOverrides` מאפשר date/amount גם בשורה שמקורה בתנועת בנק | אישור אינו מבטיח שסכום ותאריך ההוצאה עדיין זהים לתדפיס הבנק |
| AI | חילוץ JSON סובלני ללא confidence/schema מלא; כשל parsing עשוי ללוגג קטעי תוכן | איכות, חסיון לוגים והערכת תוצאות דורשים בדיקה נפרדת |
| עבודת רקע | Cron ופעולות async אינם תור משימות עמיד מאומת | restart או כמה replicas מחייבים בחינת מסלולי recovery ונעילות |
| `/daily-task` | לא נמצא guard מקומי ב־`AppController` | הגנת תשתית ומתזמן חיצוני לא אומתו |
| קובץ אחיד | יצירה ואימות מקומי קיימים; בסיס OAuth למוצר השידור נפרד | אין להסיק שידור production פעיל או אישור רגולטורי |
| תזרים | נשען על שכבת cache של תנועות; היומן הוא מודל אחר | תזרים, הוצאה ורווח אינם מדדים חלופיים זהים |

מקורות: `backend/src/bookkeeping/bookkeeping.service.ts`, `backend/src/documents/documents.service.ts`, `backend/src/annual-report/annual-report.service.ts`, `frontend/src/app/pages/reports/reports.page.ts`, `frontend/src/app/app-routing.module.ts`, `backend/src/notifications/notification.service.ts`, `backend/src/report-workflow/report-workflow.service.ts`, `backend/src/reports/matching.service.ts`, `backend/src/reports/report-review.service.ts`, `backend/src/documents/document-processor.service.ts`, `backend/src/app.controller.ts`, `backend/src/shaam/uniform-file/`.

## סטייה בין תיעוד לקוד

שורש `AGENTS.md` עדיין מתאר cutover-in-progress; אין כאן ראיה חיה לסיום cutover. ישויות legacy וסקריפטים נשארו במאגר. התוכנית החשבונאית היא הסמכות לכוונה, אך אין להסיק ממצב checkbox שכל הסכמה הנוכחית או הפריסה תואמות לה.

בתוכנית D9 המקורית מצב מקצועי הוצע לכולם; בקוד `report-review-view-mode.ts` הוא מוגבל לפי זהות השחקן. מפת הממשק מתעדת את הקוד ומציינת את הפער, בלי להחליט על שינוי מדיניות. גם מסמך topic של bookkeeping מכיל תיאורים ישנים של היעדר routes ושל התנהגות seed; הקוד הנוכחי כולל controller ו־seed מסוג create-only. ראו [ארכיטקטורת backend](../03-backend/architecture.md).

בתחום PDF, `backend/src/documents/AGENTS.md` מפנה לממצאי audit על הנחות ותצוגת סיכומים. קיים קובץ characterization ב־`backend/src/documents/pdf/document-pdf-discount-audit.spec.ts`; הוא לא הורץ כאן, ואין להסיק ממבחני אפיון שהחישוב או התצוגה תקינים. אימות עצמאי של הסוגיה לא נכלל במיפוי.

## שאלות שיש להשלים מחוץ למשימה

1. איזו גרסה פרוסה, אילו שינויי סכמה הוחלו ואילו מוצרי SHAAM מופעלים בפועל?
2. מי מפעיל את `/daily-task`, כיצד הכניסה מוגנת, וכיצד נמנעת הרצה כפולה בין replicas?
3. מהם שיעורי הצלחת חילוץ, תיקוני משתמש, טעויות התאמה, latency ועלות למסמך?
4. מה מדיניות השמירה והגישה לקבצים, `rawResponse`, tokens ולוגים במערכות החיצוניות?
5. אילו תהליכים שנתיים ושידורים לרשות הם יעדי מוצר מאושרים ואילו תשתיות ניסיוניות בלבד?

אלו שאלות אימות, לא בקשות לשנות את המערכת במסגרת המיפוי.

## מגבלות AI Chat ב־AI-DEV

במקור הפיתוח הנקוב בראש המסמך קיימת תשתית שיחה, כלים וזיכרון זמני; האמירה הקודמת על היעדרם חלה על MAIN בלבד. readers של accounting/cashflow מלאים ו־resolvers שאינם BUSINESS עדיין אינם מחוברים. כלי ההוצאות מציגים מודל spending שמשלב מאושר וממתין, ואינם דוח יומן או חישוב הכרה למס. המידע הבנקאי תלוי ב־cache; session וסיכום אינם ראיה לתוצאה כספית עדכנית.

יש מגבלות תורים, קריאות, פריטים ותאריכים, אך סקירת תשובה במודל אינה הבטחת נכונות סמנטית. תצורת provider, טבלת session חיה, איכות, עלות ו־acceptance לא אומתו. קיימים evaluation fixtures אך לא הורצו. ב־client-view רגיל הצ׳אט חסום; בהקשר עצמי נשמרת גישה לעסקים בבעלות וב־ACTIVE delegation; אין להחיל עליו בלי בדיקה את כללי המסכים האחרים. לא נמצא `SubscriptionGuard` ב־controller הצ׳אט. זהו ממצא קוד, לא שינוי מדיניות מוצע.

מקורות AI-DEV: `backend/src/ai-chat/ai-chat.service.ts`, `backend/src/ai-chat/ai-chat.controller.ts`, `backend/src/ai-chat/chat-business-scope.service.ts`, `backend/src/ai-chat/chat-spending-query.service.ts`, `backend/test/ai-chat/reliability.md`. [הפירוט המלא](../06-ai/development-ai-chat.md).

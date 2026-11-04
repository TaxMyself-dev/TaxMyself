# State, שירותים וגבולות API

מפת הבסיס להלן מתארת MAIN. **תוספת AI-DEV:** ב־worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`, נוסף `frontend/src/app/services/ai-chat.service.ts`. הוא קורא turn ו־session lifecycle עם credentials; זיכרון סמכותי נשמר בשרת, וה־UI מחזיק עותק לתצוגה. cookie HttpOnly, שחזור, heartbeat, הבהרות וסגירה מפורטות ב־[מפת פיתוח AI Chat](../06-ai/development-ai-chat.md). הצ׳אט אינו משנה את בחירת העסק הכללית.

## ניהול מצב

אין תלות NgRx ב־`frontend/package.json`. דפוסי המצב שנמצאו הם `signal`/`computed` לשירותים ולמסכים, `BehaviorSubject` להפצת זהות/לקוח/סטטוס, Reactive Forms ו־RxJS ל־HTTP ול־polling. מצב טבלאות, בחירות ודיאלוגים נשאר פעמים רבות בתוך page component גדול.

| תחום מצב | בעלים | התמדה ועדכון |
|---|---|---|
| זהות Firebase | `AuthService`, helper אתחול Firebase | `browserSessionPersistence`; `authInitialized`, המתנה ל־auth init |
| פרופיל אמיתי, עסקים לפי הקשר | `IdentitySessionStorageService` | envelopes ב־sessionStorage, קשורים ל־UID ולהקשר; ניקוי identity legacy מ־localStorage |
| לקוח נבחר | `ClientPanelService` | sessionStorage ו־BehaviorSubject; UI מציג banner ומאפשר יציאה מהקשר |
| עסק פעיל | `AuthService`, `GenericService` | business number פעיל + signal של עסקים, טעינה מחדש מהשרת |
| מנוי ומודולים | `BillingStateService` | signals, cache בזיכרון ו־GET billing/me; רענון בעת החלפת הקשר |
| מדיניות UI | `AccessService`, `AccessHandlerService` | נגזרת ממצב billing ומ־ROUTE/FEATURE_ACCESS_CONFIG |
| שדרוג ו־loader | `UpgradeRequiredService`, `GenericService` | signals בזיכרון; dialogs ו־toasts במעטפת |
| סנכרון מקורות | `SyncStatusService` + דפי home/transactions | polling של סטטוס; טעינה/רענון טבלאות בהתאם לתוצאה |
| review | `ReportReviewPage` | rows, בחירה וטיוטת עריכה בזיכרון; edit מחויב לשרת לפני סגירת dialog |
| דוח שנתי | `AnnualReportPage` | answers/steps ב־signals; שמירה מושהית של 800ms ושליחה לפני יציאה |
| חיבור רשת | `NetworkStatusService` | signal עם מצב ONLINE/OFFLINE/כשל קישוריות; אירוע reconnect |

מקורות: `frontend/src/app/shared/auth/identity-session-storage.service.ts`, `frontend/src/app/shared/auth/firebase-auth-persistence.ts`, `frontend/src/app/services/auth.service.ts`, `frontend/src/app/services/clients-panel.service.ts`, `frontend/src/app/services/generic.service.ts`, `frontend/src/app/services/billing-state.service.ts`, `frontend/src/app/pages/report-review/report-review.page.ts`, `frontend/src/app/pages/annual-report/annual-report.page.ts`.

השמות `getUserDataFromLocalStorage()` וכדומה הם שמות legacy: התיעוד והמימוש הנוכחי מפנים ל־cache זהות מבודד ללשונית. אין להסיק משם המתודה שהפרופיל הנוכחי עדיין נשמר ב־localStorage משותף.

## מעטפת HTTP

`AuthInterceptor` מקבל Firebase ID token ומוסיף `Authorization: Bearer …`, `businessnumber` ו־`x-client-user-id` כשקיים הקשר מתאים. header מפורש של לקוח נשמר, כדי שפעולה בשורת לקוח במשרד לא תידרס בידי הקשר גלובלי. business number שלא בטוח ל־header אינו נשלח. זהות אמיתית ולקוח מיוצג נשארות מושגים שונים; השרת מאמת את ההרשאה להקשר המבוקש.

`AuthErrorInterceptor` מדווח על הצלחה/כשל קישוריות. שגיאת transport אינה logout. על 401 נבדק אם Firebase מחזיק משתמש; logout מתבצע כשאין סשן ואין מדובר במסך public login/register. אין מנגנון retry כללי שמבטיח replay של כתיבות.

מקורות: `frontend/src/app/interceptors/auth.interceptor.ts`, `frontend/src/app/interceptors/authError.interceptor.ts`, `frontend/src/app/services/pwa/app-refresh.service.ts`.

## קבוצות שירותים פעילות

כתובות API נבנות מ־`environment.apiUrl`; מוצגים כאן שמות endpoints בלבד, ללא ערכי סביבה. הטבלה מרכזת גבולות חשובים ואינה קטלוג של כל מתודה.

| שירות / קובץ | צרכנים עיקריים | API / אחריות | מצב |
|---|---|---|---|
| `AuthService` | login/register, settings, guards, shell | `auth/signin`, `auth/signup`, `auth/update-user`, `auth/children`; Firebase ומצב זהות | ממומש |
| `GenericService` | shell, settings, דוחות ודיאלוגים | `business/get-businesses`, create/update/delete; רשימת עסקים, חשבונות ו־loader | ממומש |
| `BillingStateService` | shell, billing, subscription tab | `billing/me`, payments/receipts, change-payment-method, cancellation ו־plan-change | ממומש |
| `AccessService`, `AccessHandlerService`, `UpgradeRequiredService` | cards, menus, route guards | החלטת זמינות/שדרוג; ללא סמכות auth עצמאית | ממומש |
| `ClientPanelService`, `MyPermissionsService`, `ReferralService` | office, permissions, referral consent | `delegations/users-for-agent`, create-client, invite, referral-consent; client context | ממומש |
| `ExpenseDataService` | expenses, modals, reports | `expenses/*`, `bookkeeping/expense-catalog`; הוצאות, ספקים וקטלוג | ממומש; שמות default/user ישנים ב־URL אינם הוכחה למודל הטבלאות הישן |
| `TransactionsService` | transactions, dashboard, settings, reports | תנועות, חשבונות, מקורות וסיווגים; `categoryListRefreshTrigger` | ממומש; נמצא תחת `pages/transactions/transactions.page.service.ts` |
| `SyncStatusService`, `FeezbackService` | home, transactions, admin | sync-status, retry-source, post-consent-sync, consent-link, connection-options | ממומש; תוצאת ספק מחייבת אימות שרת |
| `OpenBankingEnrollmentService` | billing/open-banking | `billing/open-banking/enrollment`; תיאום הכנה לפני יציאה לספק | ממומש |
| `DocumentsService` | מסמכים והכנסות | get-docs, get-doc-lines, update-status, finalize-allocation | ממומש |
| `DriveDocsService` | quick-upload, archive | `documents/me/upload-to-inbox`, process-inbox, archived, restore, classification | ממומש |
| `ReportReviewService` | report-review, pre-flight | `reports/me/preview`, preview-check, review/approve-*, update-doc/update-tx, link, file, reject; complete-mapping | ממומש |
| `BookkeepingCatalogService` | office, admin, review | `bookkeeping/accounts`, sections, catalog-overview, pending-approvals; `admin/booking-accounts`; accountant business catalog | ממומש |
| `AnnualReportService` | annual-report | `annual-report/*`: report, answers, files, finish ו־reported | קוד ממומש; החשיפה מה־reports עדיין מוסתרת |
| `TaskDataService`, `ReportWorkflowService` | office, client tasks, reports | `accountant-tasks`, `report-workflows`; סטטוס חובת דיווח וקובץ דיווח | ממומש; אינו הוכחה להגשה אוטומטית לרשות |
| `IntegrationsService`, `GmailSyncStateService`, `InboundEmailService` | settings children | חיבור Gmail, import/sync וכתובת inbound/forwarding | ממומש |
| `ShaamService` | doc-create, callback | oauth/authorize, connection-status, invoices/allocation ו־recover | ממומש; תלוי OAuth ושרת |
| `FilesService` | upload/preview/export | Firebase Storage, הורדה/preview, multipart/API utilities; לא כל קובץ במערכת עובר באותו אחסון | ממומש |
| `AccountImagesService` | profile/business image component | authenticated GET/POST/DELETE ל־auth/profile-image ו־business/:id/logo | ממומש |
| `AdminPanelService`, `AdminBillingService` | admin panel | משתמשים, תחזוקת נתוני demo/sync ו־`admin/billing` | ממומש; פעולות ניהול נפרדות מזרימות לקוח |

כל שירות ללא נתיב מיוחד בטבלה נמצא בתיקיית `frontend/src/app/services/`, בשם kebab-case עם סיומת `.service.ts`. דוגמה: `BillingStateService` ב־`frontend/src/app/services/billing-state.service.ts`. חוזי ה־review והקטלוג מוגדרים גם בתוך קובצי השירות עצמם.

## נקודות צימוד ומגבלות

- `AppComponent` מחליף פרופיל אפקטיבי, מרענן עסקים ו־billing בעת שינוי לקוח. שינוי context בלי invalidation עלול להציג הרשאות או נתונים מהקשר קודם.
- דפי `my-account`, `doc-create`, `report-review` ו־`settings` מרכזים orchestration עסקי רב. כדי להבין פעולה יש לקרוא גם handler, service, guard ו־policy; קיומו של כפתור לבדו אינו מגדיר הרשאה.
- מצב סנכרון בנקאות וסטטוס תשלום הם אסינכרוניים. חזרה מ־URL של ספק אינה נחשבת בפני עצמה הצלחה.
- מודולי INVOICES/EXPENSES/OPEN_BANKING/ACCOUNTANT מוגדרים בחוזה UI; רק חלק מהנתיבים כוללים ModuleAccessGuard. מע״מ/P&L/מקדמות/מבנה אחיד משויכים כיום ל־INVOICES, גם כשהתוכן כולל הוצאות.
- לא בוצע אימות ריצה או רשת. תקינות cache בלשוניות, תרחישי offline, callback ו־polling נשענת כאן על קריאת קוד, ולא על תוצאת E2E.

מקורות: `frontend/src/app/app.component.ts`, `frontend/src/app/shared/access-control.ts`, `frontend/src/app/services/billing-state.service.ts`, `frontend/src/app/pages/my-account/my-account.page.ts`, `frontend/src/app/services/pwa/app-refresh.service.ts`.

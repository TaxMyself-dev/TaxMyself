# נתיבים, מסכים וזרימות מוצר

## מקרא הרשאות

`A` = `AuthGuard`; `B` = `BillingGuard`; `M` = `ModuleAccessGuard`. כל הנתיבים בטבלת האפליקציה נמצאים תחת `OfflineNavigationGuard`, אך לא כולם כוללים `A` או `B`. טבלת הנתיבים מתארת את הקוד, ואינה קביעה שהגישה בשרת פתוחה.

מקור ראשי: `frontend/src/app/app-routing.module.ts`. פירוט מודולים: `frontend/src/app/shared/access-control.ts`.

## כניסה ו־callbacks

| נתיב | יעד/משתמש | מנגנון | מצב |
|---|---|---|---|
| `/` | הכרעת כניסה | `StartupRedirectGuard` → home/login | ממומש |
| `/login` | אימייל וסיסמה או Google | `LoginPageGuard`; המתנה לאתחול auth | ממומש |
| `/register` | הרשמה ומידע אישי/עסקי | standalone; ללא AuthGuard | ממומש |
| `/referral-consent/:code` | הסכמת משתמש לקשר עם רו״ח | `ReferralConsentGuard`; כניסה לפני הסכמה | ממומש |
| `/shaam/callback` | החזרה מתהליך OAuth | מודול callback; אין AuthGuard בהגדרת הנתיב | ממומש; הצלחה תלויה בשרת ובספק |

מקורות נוספים: `frontend/src/app/pages/login/`, `frontend/src/app/pages/register/`, `frontend/src/app/pages/referral-consent/`, `frontend/src/app/pages/shaam-callback/`.

## נתיבי האפליקציה

| נתיב | תכלית | הגנה ייעודית | מצב ומקור מסך |
|---|---|---|---|
| `/my-account` | dashboard, סנכרון, תנועות לסיווג ופעולות מהירות | A+B | ממומש; `pages/my-account/my-account.page.ts` |
| `/book-keeping` | מכולת ספרי העסק; ברירת מחדל `incomes` | A+B | ממומש; `pages/book-keeping/book-keeping-routing.module.ts` |
| `/book-keeping/incomes` | מסמכים והכנסות | M: INVOICES, בירושה A+B | ממומש; `pages/book-keeping/incomes/` |
| `/book-keeping/expenses` | הוצאות ופעולות ניהול | M: EXPENSES, בירושה A+B | ממומש; `pages/book-keeping/expenses/` |
| `/book-keeping/clients` | אנשי קשר של העסק | בירושה A+B | ממומש; `pages/book-keeping/clients/` |
| `/book-keeping/suppliers` | ספקים וברירות מחדל | בירושה A+B | ממומש; `pages/book-keeping/suppliers/` |
| `/book-keeping/archived-documents` | מסמכים מתויקים, שחזור והמשך טיפול | בירושה A+B | ממומש; `pages/book-keeping/archived-documents/` |
| `/book-keeping/tasks` | משימות דיווח של הלקוח | בירושה A+B | ממומש; `pages/book-keeping/client-tasks/` |
| `/transactions` | תנועות בנק/כרטיס, סיווג ושיוך חשבון | A+B+M: OPEN_BANKING | ממומש; `pages/transactions/transactions.page.ts` |
| `/flow-analysis` | ניתוח תזרים והוצאות | A+B+M: OPEN_BANKING | ממומש; `pages/flow-analysis/flow-analysis.component.ts` |
| `/reports` | כרטיסי ניווט לדוחות | A+B | ממומש; `pages/reports/reports.page.ts` |
| `/vat-report` | דוח מע״מ ותהליך review | A+B+M: INVOICES | ממומש; `pages/vat-report-journal/` |
| `/pnl-report` | דוח רווח והפסד לפי חתכים | A+B+M: INVOICES | ממומש; `pages/pnl-report-journal/` |
| `/advance-income-tax-report` | מקדמות מס הכנסה | A+B+M: INVOICES | ממומש; `pages/advance-income-tax-report/` |
| `/uniform-file` | יצוא מבנה אחיד | A+B+M: INVOICES | ממומש; `pages/uniform-file/` |
| `/ledger-report` | כרטסת וסינון כרטיסים/תקופה | A+B | ממומש; `pages/ledger-report/` |
| `/depreciation-report` | דוח פחת ויצוא | A+B | ממומש; `pages/depreciation-report/` |
| `/annual-report` | שאלון, מסמכים ובדיקת השלמה | A+B | חלקי מבחינת חשיפה: route פעיל; הכרטיס הוסתר ב־reports עם TODO להשלמת הפיתוח |
| `/report-review` | סקירת מסמכים ותנועות לפני רישום כהוצאה | A+B | ממומש; `pages/report-review/report-review.page.ts` |
| `/flow-report` | אישור תנועות מוכרות כהוצאות | ללא A/B/M בהגדרת הנתיב | מסלול קיים; `pages/flow-report/`; אין להסיק שהוא ה־review העיקרי |
| `/doc-create` | יצירה, טיוטה, תשלומים והקצאת SHAAM | A+B+M: INVOICES + `ViewOnlyBlockDocGuard` | ממומש; `pages/doc-create/doc-create.page.ts` |
| `/my-storage` | רשימת קבצים/הוצאות שמורות | A+B | ממומש; `pages/my-storage/` |
| `/settings` | פרטים, עסקים, קטגוריות, חיבורים, הרשאות ומנוי | A+B | ממומש; `pages/settings/settings.page.ts` |
| `/billing/plans` | בחירת תוכנית ו־checkout | A; `/billing` מפנה לכאן | ממומש; `pages/billing/billing-plans.page.ts` |
| `/billing/recovery` | הסדרת בעיית תשלום | A | ממומש; `pages/billing/billing-recovery.page.ts` |
| `/billing/open-banking` | הכנת מנוי/כרטיס וחיבור בנקאות | A | ממומש; `pages/billing/open-banking/open-banking.page.ts` |
| `/client-panel` | משרד רו״ח: לקוחות, משימות וקטלוג | A+`AccountantRouteGuard`: זהות אמיתית ACCOUNTANT/ADMIN | ממומש; `pages/clients-panel/clients-panel.page.ts` |
| `/admin-panel` | ניהול משתמשים, קטלוג, תנועות, דמו, מנויים, תוכן ותיעוד | A+`AdminRouteGuard` | ממומש; `pages/admin-panel/admin-panel.page.ts` |
| `/add-expense` | טופס הוצאה עצמאי ישן | ללא A/B/M בהגדרת הנתיב | חלקי: שדות ו־validators, אין פעולת שמירה; `pages/add-expense/add-expense.component.ts` |

נתיבי המסכים בעמודה האחרונה יחסיים ל־`frontend/src/app/`. אין wildcard route בקובץ ה־routing הראשי שנבדק. `my-status` אינו מופיע בנתיבים.

**תוספת AI-DEV:** הצ׳אט מחובר ב־shell, ללא route עצמאי. מקור: `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`; `frontend/src/app/app.component.html`, `frontend/src/app/components/ai-chat/`. הוא מוסתר בכניסה/callback וב־client-view של non-admin. הפתיחה משחזרת session מהשרת, מציגה הבהרות ומאפשרת מזעור או סגירה מפורשת. [פירוט](../06-ai/development-ai-chat.md). טבלת הנתיבים לעיל נשארת מפת MAIN.

## זרימות משתמש מאומתות בקוד

### קליטת הוצאה ואישור

מה־dashboard ניתן לבחור הוצאה ידנית (`MannualExpenseComponent`) או העלאה מהירה ל־Drive (`QuickUploadDriveDialogComponent` → `DriveDocsService`). בנייד קיימת גם בחירת צילום. ה־review העיקרי הוא עמוד `/report-review` עם query של עסק ותקופה, ולעיתים `focusDocumentId` מתוך הארכיון.

העמוד מקבל שורות `matched`, `doc_only`, `tx_only`; עריכות נשמרות בשרת לפני סגירת דיאלוג העריכה. אישור מתפצל ל־approve-matched / approve-doc-cash / approve-tx-no-doc. קיימים קישור/ניתוק מסמך ותנועה, טיפול בכפילות, תיוק מסמך שנתי ואישור מרוכז. `canManageExpenses` מהשרת שולט בפעולות mutation. צפייה במסמך יכולה להישאר זמינה גם בלי אישור לנהל הוצאות.

מצב מקצועי זמין בקוד הנוכחי רק למשתמש אמיתי ACCOUNTANT/ADMIN, למעט admin בצפיית demo; אחרים מחויבים למצב רגיל. זה שונה מהניסוח המקורי D9 בתוכנית redesign שאפשר toggle לכולם. המיפוי מתאר את המימוש המאוחר יותר, בלי לשנות מדיניות.

מקורות: `frontend/src/app/pages/my-account/my-account.page.ts`, `frontend/src/app/components/mannual-expense/`, `frontend/src/app/components/quick-upload-drive-dialog/`, `frontend/src/app/pages/report-review/report-review.page.ts`, `frontend/src/app/pages/report-review/report-review-view-mode.ts`, `frontend/src/app/services/report-review.service.ts`.

### מסמך עסקי ודוחות

`doc-create` מנהל לקוח, שורות, מע״מ, אמצעי תשלום, טיוטות, PDF ובקשת הקצאה. `ViewOnlyBlockDocGuard` חוסם יצירת מסמך בצפייה בלקוח; החריג הוא admin אמיתי הפועל על demo שאומת בשרת. דוחות מע״מ ורווח והפסד משתמשים ב־review לפני ההמשך. ב־reports כרטיס מע״מ מוסתר כשאין עסק מתאים. תצוגת דוח או סימון “דווח” אינם כשלעצמם ראיה לשידור לרשות המסים.

מקורות: `frontend/src/app/pages/doc-create/doc-create.page.ts`, `frontend/src/app/shared/guard/view-only-block-doc.guard.ts`, `frontend/src/app/pages/reports/reports.page.ts`, `frontend/src/app/services/report-workflow.service.ts`.

### משרד, הגדרות ומנוי

משרד רו״ח מציג לקוחות עם עסקים, כניסה להקשר לקוח, העלאה לעסק מסוים, משימות, דיווח וקטלוג כרטיסים. `ClientPanelService` פונה ל־`delegations`; אין לבלבל בין “לקוחות המשרד” לבין אנשי הקשר של העסק ב־book-keeping/clients.

בהגדרות קיימים פרטים אישיים/משפחתיים, עסקים, תמונה/לוגו, קטגוריות, הרשאות צפייה, כתובת דוא״ל נכנס, Gmail ומנוי. הבנקאות הפתוחה עוברת enrollment ומסך ספק; דגל connected וסטטוס תשלום נקבעים לאחר אימות שרת. ביטול מנוי/משיכת ביטול, שינוי תוכנית, היסטוריית חיובים והחלפת אמצעי תשלום קיימים בקוד, בכפוף לסטטוס ולזהות הבעלים.

מקורות: `frontend/src/app/pages/clients-panel/clients-panel.page.ts`, `frontend/src/app/pages/settings/settings.page.html`, `frontend/src/app/services/clients-panel.service.ts`, `frontend/src/app/services/billing-state.service.ts`, `frontend/src/app/services/open-banking-enrollment.service.ts`.


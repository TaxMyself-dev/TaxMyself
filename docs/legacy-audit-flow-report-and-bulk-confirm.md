# בדיקה סטטית — מועמדי legacy: flow-report ו-bulk-confirm-from-drive/check-duplicates-from-drive

תיעוד בלבד — בדיקה סטטית ממצה שבוצעה כדי לתמוך בהחלטה אם להסיר את שני הנושאים
הבאים. אין בקובץ הזה שינויי קוד. כל שורה בטבלאות מגובה בקישור לקובץ/שורה או בפלט
git בפועל שנבדק ישירות.

⚠️ בדיקה סטטית בלבד — לא נבדקו access logs / analytics בפועל. ראו הערכה בסוף כל
נושא לגבי מגבלות המסקנה.

---

## נושא 1: flow-report

### טבלת ממצאים

| # | בדיקה | תוצאה | פרטים |
|---|---|---|---|
| 1a | grep גלובלי "flow-report"/"FlowReport" — routerLink/navigate() | **לא נמצא** | אפס תוצאות ל-`routerLink.*flow-report` או `navigate\(\['flow-report'` בכל `frontend/` |
| 1b | grep גלובלי — כל האזכורים | **נמצא**, 10 קבצים | קבצי flow-report עצמו (page/module/routing/service/spec/CLAUDE.md), [app-routing.module.ts](../frontend/src/app/app-routing.module.ts), [custom-toolbar.component.ts](../frontend/src/app/shared/custom-toolbar/custom-toolbar.component.ts), [CLAUDE.md](../CLAUDE.md) (שורה אחת באינדקס נושאים) |
| 2 | app-routing.module.ts — path + guards | **נמצא** | [app-routing.module.ts:99-102](../frontend/src/app/app-routing.module.ts#L99-L102): `path: 'flow-report'`, lazy-loaded. **אין `canActivate`** — בניגוד לראוטים שכנים (למשל vat-report בשורה 97 עם `[AuthGuard, BillingGuard]`) |
| 3 | תנאי חשיפה (feature flag/role/module) ב-custom-toolbar | **נמצא switch-case, לא נמצא תנאי חשיפה** | [custom-toolbar.component.ts:85-87](../frontend/src/app/shared/custom-toolbar/custom-toolbar.component.ts#L85-L87): `case "flow-report": this.folder = 'דוח-תזרים'`. זה title-setter תגובתי בלבד — נגזר מ-`this.location.path().slice(1)` (כלומר: רק קובע כותרת *אם* הדפדפן כבר נמצא בנתיב הזה). לא נמצא feature flag/role/module check שחושף כפתור/קישור אליו |
| 4 | git log על התיקייה — עריכות תוכן אמיתיות | **נמצא** | commit אחרון (2026-07-10) הוא `320b8c0e` "Add detailed CLAUDE documentation..." — auto-generated docs, לא קוד. העריכה הפונקציונלית האחרונה: `c0f2bfde` (2026-04-15) "Update feezback flow" — נגע רק ב-`flow-report.page.ts`, 12 שורות נוספו/2 נמחקו (**לא נבדק תוכן הדיף לעומק** — נצפה רק stat). לפני כן: `199d3eda` (2025-11-22) — commit רב-קבצי אמיתי |
| 5 | קריאות ל-`transactions/save-trans-to-expenses` מכל מקום נוסף | **נמצא — עם ממצא קריטי** | הפונקציה `addTransToExpense` שקוראת ל-endpoint זה מוגדרת גם ב-[transactions.page.service.ts:294-297](../frontend/src/app/pages/transactions/transactions.page.service.ts#L294-L297), ונקראת מ-[vat-report-journal.page.ts:607](../frontend/src/app/pages/vat-report-journal/vat-report-journal.page.ts#L607) (בתוך `confirmTrans()`) ומ-[pnl-report-journal.page.ts:362](../frontend/src/app/pages/pnl-report-journal/pnl-report-journal.page.ts#L362) (אותו pattern). **אבל**: `confirmTrans()` עצמה **לא נקראת משום מקום** — grep ב-`.ts` וב-`.html` של שני העמודים החזיר אפס invocations (רק את ה-definition). כלומר: הנתיב החוקי היחיד שנמצא בפועל שמגיע ל-endpoint הזה הוא flow-report.page.ts — ושם, כפי שנמצא בבדיקות 1-3, אין נתיב ניווט אליו |

### ממצא נלווה (מעבר למבוקש, אך רלוונטי ישירות)

נבדק מדוע `confirmTrans()` לא נקראת. מסתבר ש-`getTransToConfirm()` (שכן נקראת, דרך
`onRedirectPromptAccept()` בדיאלוג "מעבר לאישור הוצאות") מגדירה
`visibleConfirmTransDialog.set(true)`, אך **הסיגנל הזה לא מחובר לשום template** —
grep מקיף ב-[vat-report-journal.page.html](../frontend/src/app/pages/vat-report-journal/vat-report-journal.page.html)
וב-[pnl-report-journal.page.html](../frontend/src/app/pages/pnl-report-journal/pnl-report-journal.page.html)
לא מצא אף התייחסות ל-`visibleConfirmTransDialog`/`ConfirmTrans`. ה-commit האחרון על
vat-report-journal (`1e5f917b`, 2026-07-19, "move confirm expense to page instead of
popup") הסיר את ה-`<app-report-review-dialog>` מה-HTML אך **לא נגע** בשרשרת
`getTransToConfirm`/`confirmTrans`/`visibleConfirmTransDialog`.

עם `git log --all --diff-filter=D` נמצא ש-`f9b2ab2b` (2026-06-15, "Update flow report
confirm expneses") מחק לחלוטין את `confirm-trans-dialog.component.*` (הקומפוננטה
שכנראה הייתה מחוברת ל-`visibleConfirmTransDialog`) — 133+49+46 שורות. זה מסביר את
ה-orphan: הקומפוננטה שהאזינה לסיגנל נמחקה, אבל הקוד שמפעיל את הסיגנל ב-
vat/pnl-report-journal נשאר.

### הערכה — flow-report

**נראה כמו dead code**, בביטחון גבוה יחסית מבדיקה סטטית: אין נתיב ניווט אליו (לא
routerLink, לא guard-מוגן), ה-CLAUDE.md של vat-report-journal (נכתב ע"י כלי תיעוד
אוטומטי) מתאר את שרשרת `getTransToConfirm`/`confirmTrans` במפורש כ-**"Legacy
fallback"**, ונמצא שהקומפוננטה שהייתה אמורה להאזין לסיגנל ה-dialog שלה נמחקה כבר
לפני כחודש.

עם זאת — **לא ניתן לקבוע בוודאות מוחלטת מבדיקה סטטית בלבד** אם מישהו מגיע לדף דרך
URL ישיר (bookmark, לינק ישן שנשלח באימייל) — אין guard שחוסם זאת, ורק בדיקת access
logs תענה על השאלה הזו סופית.

---

## נושא 2: bulk-confirm-from-drive / check-duplicates-from-drive

### טבלת ממצאים

| # | בדיקה | תוצאה | פרטים |
|---|---|---|---|
| 1 | grep גלובלי — controller/service/frontend/tests/scripts | **נמצא רק ב-backend + docs; אפס ב-frontend/tests** | מופיע רק ב-[expenses.service.ts](../backend/src/expenses/expenses.service.ts), [expenses.controller.ts](../backend/src/expenses/expenses.controller.ts), [expenses/CLAUDE.md](../backend/src/expenses/CLAUDE.md), [EXTRACTED_DOCUMENT_FLOW.md](../backend/src/expenses/EXTRACTED_DOCUMENT_FLOW.md), [docs/drive-ocr-feature.md](drive-ocr-feature.md). לא נמצאו cron jobs/scheduled tasks בפרויקט שקוראים לזה (לא אותרו קבצי cron/scheduler רלוונטיים כלל) |
| 2 | Guards | **נמצא — guard גנרי, לא ייעודי** | שני ה-endpoints: `@UseGuards(FirebaseAuthGuard, SubscriptionGuard)` ([expenses.controller.ts:50](../backend/src/expenses/expenses.controller.ts#L50), [:77](../backend/src/expenses/expenses.controller.ts#L77)). ברמת המחלקה: `@RequireModule(ModuleName.EXPENSES)` ([expenses.controller.ts:29](../backend/src/expenses/expenses.controller.ts#L29)) — חל על כל ה-controller, לא ספציפי לשני ה-endpoints האלה. אין guard שמצביע על קהל יעד מצומצם/מיוחד |
| 3 | Postman/README/CLAUDE.md נוספים | **לא נמצא Postman; נמצא תיעוד — עם הצהרת legacy מפורשת** | לא נמצא אף `*.postman_collection.json` בפרויקט. [expenses/CLAUDE.md:19](../backend/src/expenses/CLAUDE.md#L19) מתעד את שני ה-endpoints כעובדה נייטרלית. **[EXTRACTED_DOCUMENT_FLOW.md:293-295](../backend/src/expenses/EXTRACTED_DOCUMENT_FLOW.md#L293-L295) קובע במפורש**: *"`bulkConfirmFromDrive` in `expenses.service.ts` is legacy / no longer called by the frontend — the active flow goes through `report-review.service.ts`."* — הצהרה זו נוגעת ל-`bulkConfirmFromDrive` בלבד בשמה המפורש; `checkDuplicateExpensesFromDrive` לא מוזכרת שם ישירות (רק במשתמע, כי שתיהן נקראו ע"י אותו דיאלוג שנמחק — ראו למטה). [docs/drive-ocr-feature.md:29-33,186](drive-ocr-feature.md#L29-L33) מתאר את `bulk-confirm-from-drive` כחלק מזרימה ישנה (עם "Dialog: editable table + file preview pane") — התיעוד עצמו לא עודכן מאז 2026-05-30 |
| 4 | git log — עריכות פונקציונליות אחרונות | **נמצא** | `bulk-confirm-from-drive`/`bulkConfirmFromDrive`: הוצג לראשונה ולא נערך שוב מאז — commit יחיד `e15920ad` (2026-05-30). `check-duplicates-from-drive`/`checkDuplicateExpensesFromDrive`: נוסף ב-`a7c44f31` (2026-06-05), התאמה קלה ב-`f9b2ab2b` (2026-06-15). עריכה נוספת ב-`48fbb75c` (2026-06-23) **נבדקה בפועל** — זו הייתה עריכת **הערה בלבד** במקום אחר בקובץ (ב-`addExpense`, שהערתו הישנה הזכירה את השם `checkDuplicateExpensesFromDrive` כהשוואה; ההערה נכתבה מחדש בלי להזכיר את הפונקציה יותר) — לא עריכה פונקציונלית של הפונקציה עצמה |

### ממצא נלווה מכריע

`git log --all --diff-filter=D -- "*PullDriveDocsDialog*" "*pull-drive-docs*"` מראה
ש-`f9b2ab2b` (2026-06-15, "Update flow report confirm expneses") **מחק לחלוטין** את
`pull-drive-docs-dialog.component.{ts,html,scss}` (742+282+340 שורות) — זו הייתה,
לפי הערות בקוד ([report-review.page.ts:863](../frontend/src/app/pages/report-review/report-review.page.ts#L863),
[:1966](../frontend/src/app/pages/report-review/report-review.page.ts#L1966) — "Same
pattern PullDriveDocsDialog uses") הקומפוננטה ההיסטורית היחידה שקראה לשני
ה-endpoints האלה. מאז המחיקה (2026-06-15) ועד היום, אין אף קובץ frontend שמזכיר את
שני ה-endpoints.

### הערכה — bulk-confirm-from-drive / check-duplicates-from-drive

**נראה כמו dead code**, בביטחון גבוה — לא רק שאין frontend caller פעיל, אלא שהקומפוננטה
היחידה שידועה שקראה להם נמחקה במפורש לפני כחודש, ותיעוד פנימי של המודול
(`EXTRACTED_DOCUMENT_FLOW.md`) כבר מצהיר על כך במפורש עבור `bulkConfirmFromDrive`.
ה-guard הגנרי (`RequireModule(EXPENSES)`) לא מרמז על שום שימוש נסתר (למשל API
ציבורי לצד ג').

עם זאת: ההצהרה המפורשת ב-doc מכסה במפורש רק את `bulkConfirmFromDrive` — עבור
`checkDuplicateExpensesFromDrive` ההערכה מבוססת על היקש (אותו caller שנמחק), לא על
הצהרה ישירה, כך שהביטחון בה מעט נמוך יותר. כמו בנושא 1 — **קביעה סופית דורשת בדיקת
access logs**, שכן בדיקה סטטית לא יכולה לשלול קריאה חיצונית (script/integration
ידני) שלא מתועדת בקוד.

# זהות, ייצוג והרשאות

## מסלול בקשה מאומתת — ממומש

`FirebaseAuthGuard` דורש `Authorization: Bearer`, מאמת ID token באמצעות `firebase-admin` ומציב שני מזהים שונים:

| שדה | משמעות |
|---|---|
| `actorFirebaseId` | האדם שביצע את הבקשה בפועל; אינו משתנה בעת כניסה ללקוח |
| `firebaseId` | בעל הנתונים האפקטיבי; יכול להפוך למזהה לקוח לאחר בדיקת ייצוג |
| `delegationScopes` | יכולות הקשר שאומת מול `Delegation` |
| `businessNumber` | נלקח מ־header; אינו הוכחת בעלות על עסק |

`request.user.role` הוא סימון הקשר (`user`/`agent`), ולא תחליף ל־`User.role` הנשמר ב־DB. תפקידי ADMIN/ACCOUNTANT נבדקים דרך השירותים על זהות המבצע האמיתית. מקור: `backend/src/guards/firebase-auth.guard.ts`, `backend/src/guards/admin.guard.ts`, `backend/src/bookkeeping/catalog-context.service.ts`.

## ייצוג לקוח — ממומש

כאשר נשלח `x-client-user-id`, משתמש רגיל חייב קשר `Delegation` במצב `ACTIVE` בין `agentId` שלו ל־`userId` הלקוח. בהיעדרו מוחזר 403. ADMIN מזוהה מה־DB יכול לפעול בשם לקוח ללא Delegation; הדגל `isAdminImpersonation` נקבע בצד השרת. ייצוג רגיל מקבל `isDelegatedAccess`.

ברירת המחדל: GET הוא קריאה ו־POST/PUT/PATCH/DELETE הם כתיבה. `RequiredDelegationScope` על handler יכול לשנות את ברירת המחדל, למשל POST שהוא חישוב דוח לקריאה בלבד. בפועל כל Delegation פעיל מקנה קריאה גם אם `DOCUMENTS_READ` אינו ברשימה; כתיבה דורשת `DOCUMENTS_WRITE`, ואישור חשבונאי דורש `EXPENSES_APPROVE`. תוקף token לבדו אינו מקנה סמכות אישור.

הבדלה זו חשובה לסוכן AI עתידי: חישוב/הצעה, שינוי נתונים ואישור הוצאה הם שלוש רמות פעולה שונות. יש להשתמש בגבולות הקיימים; זו נקודת חיבור אפשרית בלבד, לא מערכת סוכן שכבר קיימת.

## הפרדת בעלים ורו״ח — ממומש

אם לבעלים יש Delegation פעיל לרו״ח, בקשה ישירה שלו למסלול שמסומן `EXPENSES_APPROVE` נדחית. החרגות מפורשות באמצעות `AllowRepresentedClientSubmission` מאפשרות הגשה או פעולות הכנה מוגדרות; הן אינן מעניקות אישור סופי. אישור תנועה להוצאה, שינוי החלטות בחומר שכבר אושר ופעולות דיווח מסוימות משתמשים ביכולת זו. אין להסיק שכל פעולת POST היא אישור, או שלקוח מיוצג מנוע מקריאה והכנת חומר.

מקורות: `backend/src/decorators/required-delegation-scope.decorator.ts`, `backend/src/decorators/allow-represented-client-submission.decorator.ts`, `backend/src/transactions/transactions.controller.ts`, `backend/src/reports/reports.controller.ts`, `backend/src/expenses/expenses.controller.ts`.

## גבול עסק וקטלוג — ממומש

`CatalogContextService.assertBusinessAccess` מחפש יחד `firebaseId` אפקטיבי ו־`businessNumber`, ומסרב לעסק שאינו שייך לו. הבדיקה נעקפת כשהארגומנטים חסרים, לכן אינה הגנה גלובלית לכל שאילתה. `forUser` מוסיף את כל המייצגים הפעילים לקטלוג, בלי להתנות נראות בהרשאת כתיבה. המיזוג הוא CLIENT > ACCOUNTANT > SYSTEM; קטלוג הלקוח מקבל `chartOwnerKey=CLIENT_<businessNumber>` ושל רו״ח `ACCOUNTANT_<firebaseId>`.

כתיבת SYSTEM היא ADMIN; יצירת כרטיסי שכבת רו״ח היא ACCOUNTANT/ADMIN. שינוי מיפוי של שורת SYSTEM/ACCOUNTANT בהקשר לקוח יוצר override של הלקוח במקום שינוי קטלוג משותף. היומן כולל גם `firebaseId` וגם `issuerBusinessNumber`; הוצאות כוללות `userId` ו־`businessNumber`. יש לשמר שני ממדים אלה בשאילתות וביצוא מידע.

מקורות: `backend/src/bookkeeping/catalog-context.service.ts`, `backend/src/bookkeeping/catalog.service.ts`, `backend/src/bookkeeping/admin-booking-accounts.controller.ts`, `backend/src/bookkeeping/jouranl-entry.entity.ts`, `backend/src/expenses/expenses.entity.ts`.

## מנוי, admin וגבולות חיצוניים

`SubscriptionGuard` קורא metadata של `RequireModule`, ולא חוסם route שאין בו דרישת מודול. הוא מפנה ל־`BillingService.hasModuleAccess` עם דגלי ייצוג מאומתים; מנוי אינו תחליף לבעלות על מידע. `AdminGuard` פועל על זהות המבצע האמיתי, גם בעת כניסה ללקוח. מקורות: `backend/src/guards/subscription.guard.ts`, `backend/src/guards/admin.guard.ts`.

Callbacks/webhooks נבחנים לפי מנגנון הספק, לא רק Firebase. מסלולי OAuth, חתימות ומניעת replay מתוארים במיפוי האינטגרציות. **לא אומת:** כיסוי הרשאות מלא בכל route, הרשאות חיות אצל הספקים, מדיניות ארגונית של Firebase או בידוד DB ברמת שרת. המיפוי מראה בידוד ברמת קוד השירותים; לא נמצאה כאן מדיניות row-level security מרכזית שמחליפה בדיקות קוד.

## AI-DEV — הרשאת צ׳אט ממומשת בפיתוח

מקור: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. כל routes הצ׳אט עוברים `FirebaseAuthGuard` ואז `AiChatAccessGuard`; POST מסומן כ־`DOCUMENTS_READ`. delegated client-view שאינו admin נחסם. בהקשר עצמי רשימת העסקים כוללת בעלות ו־ACTIVE delegations; admin client-view מוגבל לעסקים שבבעלות הלקוח הנצפה. הרשאה נבדקת מחדש בבחירת עסק ובכל read.

session קשור ל־actor, subject, access mode ו־scopes באמצעות digests ו־epoch; cookie אטום אינו תחליף לאימות. אין `SubscriptionGuard` על controller זה שנבדק. זהו גבול נפרד ממסלולי אישור כספים: הכלים קוראים בלבד, בעוד lifecycle של session כותב state. מקורות AI-DEV: `backend/src/ai-chat/ai-chat.controller.ts`, `ai-chat-access.guard.ts`, `chat-business-scope.service.ts` באותה תיקייה ו־`backend/src/ai-chat/session-store/conversation-session-owner.ts`. ראו [פירוט](../06-ai/development-ai-chat.md).

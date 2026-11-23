# ארכיטקטורת ממשק המשתמש

מיפוי סטטי של הקוד ב־20.10.2026. **ממומש** פירושו שקיים חיבור בקוד; אין בכך אימות ריצה, זמינות שירות חיצוני או אישור שהגרסה פרוסה בייצור.

## מבנה וגבולות

| שכבה | תפקיד ומצב | מקור |
|---|---|---|
| Bootstrap | Angular 19, TypeScript, Ionic 7; Firebase Auth מאותחל לפני עליית Angular | `frontend/package.json`, `frontend/src/main.ts` |
| Root module | `AppModule` מחבר Router, AngularFire, HttpClient, PrimeNG Aura, ECharts ו־service worker | `frontend/src/app/app.module.ts` |
| מעטפת | `AppComponent` מנהל ניווט, משתמש אמיתי מול לקוח מיוצג, הודעות מנוי, loader ושחזור אחרי reconnect | `frontend/src/app/app.component.ts`, `frontend/src/app/app.component.html` |
| מסכים | שילוב `NgModule` ו־standalone components; טעינה דרך `loadChildren` / `loadComponent`, עם `PreloadAllModules` | `frontend/src/app/app-routing.module.ts` |
| רכיבים | שדות, טבלאות, ניווט ודיאלוגים תחת `components/`; רכיבי דומיין גם תחת `shared/` | `frontend/src/app/components/`, `frontend/src/app/shared/shared.module.ts` |
| שירותים | שירותי root עם HttpClient, RxJS ו־signals; חלק מהשירותים עדיין צמודים לתיקיית המסך | `frontend/src/app/services/`, `frontend/src/app/pages/transactions/transactions.page.service.ts` |
| חוזים | טיפוסים ו־enums משותפים וקטלוג הרשאות UI | `frontend/src/app/shared/interface.ts`, `frontend/src/app/shared/enums.ts`, `frontend/src/app/shared/access-control.ts` |

זו אפליקציה אחת לבעל עסק, לרואה חשבון ולמנהל. ההבדלים בתצוגה נבנים מתפקיד המשתמש, הקשר הלקוח המיוצג, capabilities מהשרת ומודולי המנוי. הגנת UI אינה גבול האבטחה הסופי; השרת חייב לאמת כל פעולה.

## מסלול כניסה

1. `initializeFirebaseAuthPersistence()` קובע `browserSessionPersistence` לפני bootstrap, גם בדפדפן וגם ב־PWA.
2. `StartupService.whenReady()` ממתין להכרעת Firebase לגבי הסשן; ה־loader נשאר עד שהניווט הראשון מסתיים.
3. הנתיב `/` מפנה ל־`/my-account` רק כשיש חיבור, סשן ופרופיל שמור תואם. אחרת הוא מפנה ל־`/login`. אין שחזור אוטומטי של הנתיב האחרון.
4. `AuthGuard` מנסה לשחזר פרופיל מהשרת כאשר Firebase מחובר אבל cache הפרופיל חסר.
5. בתוך האפליקציה `OfflineNavigationGuard` מבטל ניווט בזמן ניתוק ומשאיר את המסך הנוכחי; לאחריו חלים guards של auth, billing ומודול בהתאם להגדרת הנתיב.

מקורות: `frontend/src/app/shared/auth/firebase-auth-persistence.ts`, `frontend/src/app/shared/auth/default-authenticated-route.ts`, `frontend/src/app/services/startup.service.ts`, `frontend/src/app/shared/guard/startup-redirect.guard.ts`, `frontend/src/app/shared/guard/auth.guard.ts`, `frontend/src/app/shared/guard/offline-navigation.guard.ts`.

## חוויית משתמש וממשק משותף

המעטפת מציגה דף בית, תזרים, דוחות, הנהלת חשבונות כשיש עסק, ניתוח הוצאות וקישורי משרד/ניהול לפי תפקיד. זמינות של פעולה עשויה להיות הסתרה, השבתה או חלון שדרוג, בהתאם ל־`FEATURE_ACCESS_CONFIG`. `GenericTableComponent` מרכז predicate וזמינות פעולה עבור כפתורי desktop ותפריטי mobile, כדי שלא להחזיק שתי מדיניות הרשאה שונות.

מקורות: `frontend/src/app/app.component.ts` (`menuItems`), `frontend/src/app/shared/access-control.ts`, `frontend/src/app/components/generic-table/AGENTS.md`.

## PWA וחיבור רשת — ממומש עם גבולות

- service worker מופעל ב־production בלבד. `ngsw-config.json` שומר shell, chunks ונכסים סטטיים; אין בו `dataGroups` לשמירת תשובות API.
- קיימים שירותי install/update, זיהוי runtime ובאנרים; האפליקציה אינה מציעה עבודה עסקית מלאה ללא רשת.
- `AuthInterceptor` מגביל המתנה להשגת token ל־10 שניות; הכשל אינו גורר בקשה אנונימית או logout בגלל ניתוק.
- בחזרת חיבור, `AppRefreshService` טוען שוב רק billing ועסקים באמצעות GET. אין replay כללי של שמירות, חיובים או העלאות שנכשלו.
- כשל chunk בעקבות גרסה חדשה מפעיל ניסיון reload אחד לכתובת היעד, עם guard ב־sessionStorage נגד לולאה.

מקורות: `frontend/ngsw-config.json`, `frontend/src/app/app.module.ts`, `frontend/src/app/services/pwa/`, `frontend/src/app/interceptors/auth.interceptor.ts`, `frontend/src/app/app.component.ts`.

## מגבלות המיפוי

לא הורצו build, tests או דפדפן במסגרת המיפוי. תמיכה במצלמה ניידת, install/update בפועל, callbacks של תשלומים ו־OAuth וזרימות מלאות דורשות אימות ריצה. פרטי סביבה, מפתחות ונתוני לקוחות אינם חלק ממסמך זה.

## AI-DEV — ממשק צ׳אט בפיתוח

מקור: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. `AiChatComponent` מחובר במעטפת האפליקציה כחלונית צפה בעברית, ללא route עצמאי. הוא מופיע רק לאחר התייצבות auth וניווט מתאים; ב־client-view נדרש ADMIN אמיתי. בחירת העסק בשיחה עצמאית מהמסכים.

`AiChatService` משתמש ב־HttpClient, interceptors קיימים ו־withCredentials ל־cookie של session. פתיחה ורענון משחזרים transcript מהשרת; מזעור שומר session, סגירה מפורשת מוחקת אותו בשרת. הממשק כולל הבהרות, מקורות ותשובה חלקית, וטקסט מודל מוצג כאינטרפולציה בלבד. מקורות AI-DEV: `frontend/src/app/app.component.ts`, `frontend/src/app/app.component.html`, `frontend/src/app/components/ai-chat/`, `frontend/src/app/services/ai-chat.service.ts`. [מפת הפיתוח](../06-ai/development-ai-chat.md) כוללת זיכרון והרשאות; אין כאן אימות UX חי.

# תהליכי רקע ותזמון

`ScheduleModule.forRoot()` רשום ב־`backend/src/app.module.ts`. שלושת ה־Cron שנמצאו בקוד היישום משתמשים ב־Asia/Jerusalem. הגדרת scheduler חיצוני בפועל, מספר replicas והיסטוריית הצלחה לא אומתו.

| מנגנון | הפעלה | אחריות ומגבלות |
|---|---|---|
| Gmail nightly | 02:00 מדי יום | תיבות פעילות שהשלימו יבוא ראשוני; batches של 3, בידוד שגיאה לכל חיבור. `backend/src/integrations/services/gmail-sync-cron.service.ts` |
| Open Banking enrollment recovery | 02:45 מדי יום | התאוששות הכנת enrollment דרך גילוי הסכמה ומקורות אצל Feezback. `backend/src/feezback/feezback.service.ts` |
| Subscription renewal | 03:00 מדי יום | חיובים שמועדָם הגיע, batches של 10; כולל הפעלת ניסיונות בנקאות פתוחה, ביטולים שהגיע מועדָם, צבירת חוב ו־reconciliation לפני חידושים. `backend/src/billing/services/subscription-renewal.service.ts` |
| Daily task HTTP | `POST /daily-task` | פקיעת trials וניקוי cache מלא של תנועות. המתזמן שקורא לו אינו מוכח בקוד זה. `backend/src/app.controller.ts`, `backend/src/app.service.ts` |
| Feezback webhooks | אירוע ספק | שמירה עם dedup, טיפול בשינוי הסכמה ובזמינות מידע, גילוי מקורות וסנכרון. `backend/src/feezback/webhook/feezback-webhook.service.ts` |
| Gmail initial sync | בקשת משתמש, המשך אסינכרוני | מצב RUNNING והחלמה ממצב תקוע לאחר 6 שעות; בסנכרון מצטבר חפיפה של 3 שעות עם cursor ומניעת כפילות תוכן. `backend/src/integrations/services/gmail-sync.service.ts` |

## מה אינו Cron

- יצירת משימות רו״ח מחזוריות מתבצעת באופן עצל בכניסה למסכים וכן דרך בקשת generate ידנית; קוד `AppService` מציין שהיצירה הוסרה מהמטלה היומית.
- ניקוי cache התנועות נמצא ב־`handleDailyCacheCleanup`; זו מתודה שנקראת מהמטלה היומית, ללא decorator משלה. הניקוי טרנזקציוני, מדלג על משתמשי demo ועל סנכרונים פעילים ומשמר את slim transactions. מקור: `backend/src/transactions/transaction-processing.service.ts`.
- עיבוד OCR מופעל דרך פעולות inbox/העלאה ולא נמצא עבורו Cron עצמאי. קיימת נעילת עיבוד inbox לפי משתמש ועסק, לרבות נעילת מסד, ב־`backend/src/documents/documents.service.ts`.
- שירות PDF הוא קריאת HTTP סינכרונית; מסמך `pdf-service/README.md` אינו הופך גבולות queue עתידיים לתור פעיל.

## גבולות תפעוליים

לא נמצא תור Bull/Redis או worker LLM מתמשך בסריקת קוד היישום. async ו־Cron בתוך תהליך Nest אינם הוכחה לתור עמיד. מצב סנכרון מתמשך במסד מסייע להתאוששות אך אינו מבטיח שהמשך עבודה ישרוד restart.

ב־`AppController` אין guard מקומי על `POST /daily-task`; אימות/הגנה בשכבת תשתית לא אומתו כאן. משלוח דוח הצלחה יומי ב־`AppService` מופיע כקוד בהערה; משלוח בשגיאה חיצונית עדיין קיים.

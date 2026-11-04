# נקודות הרחבה אפשריות ל־AI

הטבלה הבאה משמרת הזדמנויות על בסיס MAIN; היא אינה תכנון ארכיטקטורה חדש או תוכנית מאושרת. נוסף מימוש AI-DEV: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. ב־AI-DEV שיחה, registry וכלי הוצאות/קטלוג כבר מומשו; אין לסווג את עצם קיומם כהזדמנות עתידית. ראו [המימוש בפיתוח](development-ai-chat.md).

| הזדמנות | עוגן קיים | מגבלה שצריך לשמר |
|---|---|---|
| שיפור אמינות חילוץ ובקרת איכות | `backend/src/documents/document-processor.service.ts` | הבחנה בין חוסר שדה, כשל פענוח ותוצאה ריקה; אין להפוך הצעת מודל לאישור חשבונאי |
| הצגת הסבר להצעת סיווג | קטלוג עסקי וסקירת מסמכים: `backend/src/documents/documents.service.ts` | חשיפת קטלוג רק לעסק המורשה; הדין החשבונאי נשאר על הכרטיס וב־snapshot |
| סיוע בתיקון מסמך לפני אישור | `frontend/src/app/pages/report-review/`, `frontend/src/app/components/report-review-edit-dialog/` | המשתמש המוסמך מאשר; מגבלות מייצג ותקופה מדווחת נותרות מחייבות |
| סיוע לקריאה של מסמכים שלא זוהו | `backend/src/documents/extracted-document.entity.ts` | מסמך שנתי או בלתי מזוהה אינו בהכרח הוצאה; אין רישום יומן אוטומטי |
| עזרה באבחון התאמות מסמך–תנועה | `backend/src/reports/matching.service.ts`, `backend/src/documents/document-pairing.service.ts` | התאמה מוצעת צריכה לשמר provenance ולמנוע הכפלת הוצאה |
| הסבר דוחות בשפה טבעית | `backend/src/reports/`, `backend/src/report-workflow/` | מספרים מחושבים בשירותים הקיימים; הקשר העסק וההרשאות מגבילים את הקריאה |
| הרחבת שאילתות בשיחה למקורות נוספים | MAIN: transactions/reports; AI-DEV: `backend/src/ai-chat/tools/` | registry כבר קיים ב־AI-DEV; כלי accounting/cashflow מלאים עדיין אינם מחוברים; API קיים אינו הרשאה למודל |

## תנאי בסיס שכבר קיימים בקוד

קיימים Firebase authentication, זהות אפקטיבית ו־delegation scopes, זכאות מודולים במנוי, הפרדת משתמש/עסק, אישור הוצאות ונעילת תקופות. הרחבה עתידית אינה יכולה להסתפק בהנחיית prompt לשמירתם; נקודות הבדיקה הקיימות בשרת הן הגבול הרלוונטי.

מקורות: `backend/src/guards/firebase-auth.guard.ts`, `backend/src/guards/subscription.guard.ts`, `backend/src/expenses/expenses.service.ts`, `backend/src/transactions/transaction-processing.service.ts`, `docs/redesign/categories-redesign-master-plan.md`.

## מה טרם הוכח

ב־AI-DEV קיימים שיחה, tool calling וזיכרון session זמני. לא נמצא retrieval וקטורי או worker של agent למשימות רקע עמידות. הרחבת resolvers, הוספת readers למסמכים/יומן/דוחות ופעולות כתיבה הן יכולות שלא אומתו כמימוש מחובר. quality fixtures קיימים בצ׳אט, אך אין במיפוי אישור ליעדי איכות או תקציב production. סמכויות כתיבה ותכנון הרחבות דורשים אפיון נפרד.

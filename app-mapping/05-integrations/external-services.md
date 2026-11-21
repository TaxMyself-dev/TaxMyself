# שירותים חיצוניים

מיפוי סטטי של המימוש הנוכחי; קיום קוד אינו הוכחה שהשירות מוגדר או פעיל בייצור. לא נבדקו חשבונות ספקים או סודות.

הטבלה מתארת MAIN. **AI-DEV** מוסיף חיבור Anthropic נפרד לצ׳אט ב־`C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. מקור: `backend/src/ai-chat/providers/anthropic-chat-model.provider.ts`, `backend/src/ai-chat/chat-model.gateway.ts`. ברירת המחדל לצ׳אט היא `claude-haiku-4-5`, ניתנת להגדרה בשרת, וה־provider מושבת ללא תצורה תקפה. אין לערבב בינו לבין מודל OCR הקבוע ב־MAIN. [פירוט](../06-ai/development-ai-chat.md).

| שירות | שימוש מאומת בקוד | גבול המערכת / מקור |
|---|---|---|
| Firebase Authentication | אימות זהות ו־ID token, חשבונות משתמשים | `backend/src/guards/firebase-auth.guard.ts`, `backend/src/users/auth.service.ts` |
| Firebase Storage | אחסון PDF של מסמכים מונפקים | `backend/src/documents/documents.service.ts` |
| Google Drive | תיקיות משתמש ועסק, inbox/processed, העלאה, הורדה ושיתוף עם מייצג; אימות service account | `backend/src/google-drive/google-drive.service.ts` |
| Gmail / Google OAuth | חיבור תיבות, הרשאת קריאה, סריקת קבצים מצורפים, יבוא ראשוני וסנכרון מצטבר | `backend/src/integrations/integrations.controller.ts`, `backend/src/integrations/services/google-oauth.service.ts`, `backend/src/integrations/services/gmail-reader.service.ts` |
| Mailgun | webhook דואר נכנס, כתובת עסק יציבה, אימות חתימה, יבוא מצורפים והעברת אישורי forwarding של Google | `backend/src/inbound-email/mailgun-inbound.controller.ts`, `backend/src/inbound-email/mailgun-signature.service.ts` |
| Anthropic Claude | חילוץ וסיווג מסמכים נכנסים באמצעות `claude-sonnet-4-6` | `backend/src/documents/document-processor.service.ts` |
| Feezback | הסכמה לבנקאות פתוחה, גילוי מקורות בנק/כרטיס, משיכת תנועות ו־webhooks; גילוי V1 ומשיכת תנועות V2 | `backend/src/feezback/feezback.service.ts`, `backend/src/feezback/consent/feezback-consent-api.service.ts` |
| CardCom | דפי תשלום, אמצעי תשלום, חיוב חידושים, callbacks ובירור תוצאה | `backend/src/billing/services/cardcom.service.ts`, `backend/src/billing/services/cardcom-webhook.service.ts`, `backend/src/billing/services/subscription-renewal.service.ts` |
| Brevo | דואר תפעולי/עסקי וקבצים מצורפים: הזמנות, קבלות והתראות | `backend/src/mail/mail.service.ts` |
| SHAAM | OAuth עסקי בצד השרת, בקשת הקצאה, שחזור ואימות מספר הקצאה מול חשבונית שמורה | `backend/src/shaam/shaam-secure.controller.ts`, `backend/src/shaam/services/shaam-document-allocation.service.ts` |
| בנק ישראל | שער מטבע ל־ILS עם cache בזיכרון ובמסד | `backend/src/shared/fx-rate.service.ts` |
| FillFaster | חתימה על PDF בהנפקה | `backend/src/documents/pdf/fillfaster-signer.service.ts` |
| שירות PDF פרטי | רינדור Chromium דרך HTTP עם IAM, או רינדור מקומי בפיתוח | `backend/src/documents/pdf/document-pdf-client.ts`, `backend/src/documents/pdf/document-pdf-renderer.service.ts`, `pdf-service/README.md` |

## הבחנות חשובות

- חיבור Gmail של המשתמש ו־service account של Drive הם מנגנוני אימות נפרדים. יבוא Gmail מסתיים ב־Drive inbox; הוא אינו אישור הוצאה ואינו OCR בפני עצמו.
- tokens של Gmail ו־SHAAM נשמרים בשרת עם הצפנה ומצב OAuth קשור ליוזם. הרשאות עסק, מייצג ומנוי נאכפות בנפרד מהרשאת הספק.
- SHAAM לקובץ אחיד הוא מסלול מוצר נפרד עם יסודות OAuth ו־Daily Token; אין להסיק שקיים שידור אוטומטי פעיל בייצור. ראו `backend/src/shaam/uniform-file/` ותיעוד הנושא.
- מחיקת רישום Feezback אצל הספק לאחר ביטול/שנמוך מסומנת כעבודה עתידית; עצירת גישה מקומית אינה הוכחת עצירת עלות ספק. מקור: `backend/src/feezback/AGENTS.md`.
- שירות FX מתעד מגבלת דיוק היסטורי משום שפרמטר התאריך עלול להיעלם בהתנהגות הספק. אין לייחס למודל AI את חישוב ההמרה.

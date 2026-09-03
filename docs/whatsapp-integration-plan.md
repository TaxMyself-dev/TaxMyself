# תכנית שילוב WhatsApp ב-TaxMyself

תאריך: 30.08.2026  
סטטוס: תכנית מוצר וארכיטקטורה — טרם מומשה

## 1. החלטה מומלצת

ל-MVP מומלץ להתחבר ישירות ל-**WhatsApp Business Platform Cloud API של Meta**, עם מספר עסקי אחד ממותג של TaxMyself.

המספר המרכזי ישרת את כל הלקוחות, והמערכת תזהה את השולח לפי מספר הטלפון המקושר לחשבון. כל הודעה ומסמך יישארו משויכים גם ללקוח, לעסק ולרואה החשבון הרלוונטי.

לא מומלץ להתחיל ממספר WhatsApp נפרד לכל רואה חשבון. מודל כזה מחייב onboarding רב-דיירי באמצעות Embedded Signup, שמירת WABA ו-phone-number ID לכל משרד, הרשאות Meta מתקדמות, תפעול תבניות וחיוב לכל משרד, וטיפול בניתוקי חשבונות. יש לבחון אותו בשלב מאוחר יותר אם White-label הוא דרישת מוצר מהותית.

## 2. מטרות ותחום

### MVP

1. לקוח מקשר ומאמת את מספר ה-WhatsApp שלו ומאשר קבלת הודעות.
2. לקוח שולח PDF או תמונה ב-WhatsApp.
3. המערכת מזהה את הלקוח והעסק, מורידה את הקובץ ומעבירה אותו לצינור הקליטה הקיים.
4. הקובץ עולה לתיקיית `Drive inbox/`, מקבל מניעת כפילויות לפי hash וממשיך ל-OCR ולעמוד אישור ההוצאות הקיימים.
5. הלקוח מקבל אישור קליטה או הודעת שגיאה ברורה.
6. המערכת שולחת ללקוח הודעות תפעוליות מבוססות תבניות מאושרות.
7. רואה חשבון יכול ליצור ולתזמן בקשות מסמכים ללקוח אחד או לקבוצת לקוחות.
8. נשמר audit מלא של הודעות, מסירות, כשלונות והסרת הסכמה.

### מחוץ ל-MVP

- מספר WhatsApp נפרד לכל משרד רו"ח.
- מוקד שירות מלא עם הקצאת שיחות לנציגים.
- בוט חופשי או AI שעונה על שאלות מס/חשבונאות.
- קליטת הודעות קוליות וניתוח שלהן.
- קמפיינים שיווקיים.
- WhatsApp Flows עשירים; אפשר להוסיף לאחר הוכחת שימוש.

## 3. התאמה לארכיטקטורה הקיימת

המערכת כבר מכילה את רוב נקודות העיגון הנדרשות:

- `DocumentImportService` הוא צינור קליטה מרכזי: חישוב SHA-256, מניעת כפילויות בין ערוצים, העלאה ל-Drive ויצירת `imported_documents`.
- `DocumentImportSource` כבר תוכנן לערוצי קליטה עתידיים.
- `NotificationService` הוא seam יציב שנכתב מראש לחיבור WhatsApp/email/in-app.
- `ReportWorkflow` מכיל אירועים מתאימים: פתיחת תקופת דיווח, הלקוח סיים להעלות, והדוח דווח.
- `AccountantTask` כבר מכיל תקופה, תאריך יעד ורואה חשבון/לקוח.
- `Delegation` מספק את גבול ההרשאה בין רואה חשבון ללקוח.
- `User.phone`, `Business.businessPhone` ו-`Business.businessNumber` קיימים, אך אין להסתמך על מספר טלפון לא מאומת לצורך שיוך מסמך.

כלל ארכיטקטוני: WhatsApp יהיה **ערוץ**, לא בעלים של הלוגיקה העסקית. מסמכים ימשיכו לעבור דרך `DocumentImportService`, ואירועי מערכת ימשיכו לעבור דרך `NotificationService`.

## 4. זרימת מסמך נכנס

```text
WhatsApp של הלקוח
        |
        v
Meta webhook (messages)
        |
        v
אימות חתימה + dedup לפי Meta message id
        |
        v
זיהוי wa_id -> לקוח מאומת -> עסק יעד
        |
        v
שליפת media URL והורדת הקובץ מיד
        |
        v
בדיקת MIME, גודל, hash ואבטחה
        |
        v
DocumentImportService (source=WHATSAPP)
        |
        v
Drive inbox -> OCR קיים -> report review
        |
        v
אישור קליטה / כפילות / שגיאה ללקוח
```

Meta שולחת במסר הנכנס `media_id`. תחילה שולפים URL זמני, ואז מורידים את הקובץ עם access token. ה-URL תקף לזמן קצר, ולכן ה-webhook צריך לרשום אירוע ולהעביר אותו לעיבוד מיידי; אין לשמור URL לשימוש עתידי.

### זיהוי הלקוח והעסק

- מספרים נשמרים בפורמט E.164 מנורמל ו-`wa_id` נשמר בנפרד.
- רק קישור שאומת בקוד חד-פעמי או בקישור WhatsApp אישי יוצר זהות מהימנה.
- שולח לא מוכר לא יוכל לגרום להעלאת מסמך לתיק של לקוח כלשהו. הוא יקבל קישור מאובטח להתחברות/קישור החשבון.
- לקוח עם עסק אחד: המסמך משויך אוטומטית.
- לקוח עם מספר עסקים: המערכת מבקשת בחירה בכפתורים ושומרת `activeBusinessNumber` לזמן מוגבל. עד לבחירה הקובץ נשמר במצב `WAITING_FOR_BUSINESS`, לא מועלה לתיק עסק שרירותי.
- ניתן לאפשר טקסט מקדים כגון `לעסק 515...`, אך הוא לא יהיה מנגנון הזיהוי היחיד.

### סוגי קבצים ל-MVP

- `application/pdf`
- `image/jpeg`
- `image/png`

יש לדחות קבצים אחרים בהודעה ידידותית. מגבלות פנימיות יכולות להיות מחמירות ממגבלות Meta, בהתאם ליכולת ה-OCR. אין לעבד קובץ לפי סיומת בלבד.

### מניעת כפילויות

יש שתי שכבות idempotency:

1. `meta_message_id` ייחודי — מונע עיבוד חוזר של אותו webhook.
2. מנגנון ה-SHA-256 הקיים ב-`DocumentImportService` — מונע מסמך זהה גם אם נשלח שוב או כבר הועלה דרך Drive/Gmail.

## 5. זרימת הודעות יוצאות

```text
אירוע מערכת / תזמון רו"ח
        |
        v
NotificationService
        |
        v
בדיקת הרשאה + opt-in + quiet hours + template
        |
        v
Notification/Message Outbox בבסיס הנתונים
        |
        v
Worker שולח ל-Meta Graph API
        |
        v
Webhook סטטוסים: sent / delivered / read / failed
```

אין לשלוח ישירות מתוך בקשת HTTP עסקית. קודם שומרים רשומת outbox בטרנזקציה, ואז worker שולח. כך deploy, timeout או retry לא מייצרים אובדן או כפילות.

### סוגי הודעות

- **Utility**: בקשת מסמכים לתקופת דיווח, תזכורת לפני מועד, אישור קליטה, מסמך לא קריא, דוח דווח, פעולה שנדרשת בחשבון.
- **Marketing**: תוכן כללי, מבצע, upsell או הודעה שאינה קשורה ישירות לשירות/פעולה של הלקוח. זה מסלול נפרד, עם הסכמה ותקציב נפרדים.
- בתוך חלון השירות שנפתח בעקבות הודעת הלקוח ניתן להשיב בהתאם לכללי Meta; יוזמה מחוץ לחלון מחייבת בדרך כלל תבנית מתאימה. מבחינת המוצר יש להניח שכל הודעה מתוזמנת היא template message.

המונח "התראה כללית" חייב להפוך במוצר לאחת מקטגוריות ההודעה. לא נותנים לרואה החשבון לשלוח טקסט חופשי לרשימה גדולה ולעקוף את סיווג Meta.

## 6. תזמון לרואה החשבון

במסך הלקוחות תתווסף פעולה "תזמן הודעת WhatsApp":

- בחירת לקוח אחד, מספר לקוחות או segment מוגדר.
- בחירת תבנית מאושרת בלבד.
- משתנים: שם לקוח, שם עסק, סוג דוח, תקופה, תאריך אחרון וקישור פעולה.
- תצוגה מקדימה מלאה לפני שמירה.
- תאריך ושעה באזור `Asia/Jerusalem`.
- אפשרות לתזכורת חוזרת רק למי שעדיין לא השלים את הפעולה.
- הצגת כמות נמענים, חסרי opt-in ומספרים לא תקינים.
- ביטול לפני שליחה, היסטוריה ותוצאות מסירה.

### מודל תזמון מומלץ

`notification_schedule` שומר את הגדרת התזמון. בעת ההפעלה נוצרת רשומת `notification_delivery` נפרדת לכל נמען. Worker אטומי "תופס" משלוחים שהגיע זמנם, שולח ומעדכן סטטוס. מפתח idempotency מונע שליחה כפולה.

מומלץ להפעיל worker באמצעות Cloud Scheduler/משימת תשתית כל דקה או תור מנוהל, ולא להסתמך רק על `@Cron` בזיכרון. הדבר חשוב במיוחד אם יש כמה מופעי backend, restart או scale-to-zero.

### הרשאות

- רואה חשבון יכול לפנות רק ללקוח עם `Delegation.ACTIVE` בזמן יצירת המשלוח ובזמן השליחה.
- הסרת הרשאה לפני זמן השליחה מבטלת את המשלוח.
- תבניות מערכת יכולות להישלח רק מאירוע מורשה בצד השרת.
- כל שינוי בתזמון נשמר עם actor, זמן וערכים קודמים/חדשים.

## 7. מודל נתונים מוצע

### `whatsapp_contact`

- `id`
- `firebase_id`
- `phone_e164`
- `wa_id`
- `phone_verified_at`
- `opt_in_operational_at`
- `opt_in_marketing_at` (נפרד ואופציונלי)
- `opt_in_source` + גרסת נוסח ההסכמה
- `opted_out_at`
- `last_inbound_at`
- `active_business_number` + `active_business_expires_at`
- unique על `wa_id` ועל מספר מאומת לפי כללי הבעלות שיוגדרו

### `whatsapp_message`

- `meta_message_id` ייחודי
- direction, sender/recipient, contact, businessNumber
- type, templateName, templateLanguage
- status ו-errorCode
- related entity (`workflow`, `schedule`, `imported_document`)
- timestamps של received/sent/delivered/read/failed
- payload מצומצם או מוצפן; לא לשמור webhook מלא ללא צורך

### `notification_schedule` ו-`notification_delivery`

- יוצר, template, משתנים, זמן, timezone, recurrence/condition
- לכל נמען: snapshot של היעד, סטטוס, attempts, nextAttemptAt, providerMessageId
- unique idempotency key לכל schedule+recipient+occurrence

### שינוי `imported_documents`

- הוספת `WHATSAPP` ל-`DocumentImportSource`.
- עדיף להוסיף שדות מקור גנריים (`source_external_id`, `source_metadata JSON`) ולא עוד קבוצת עמודות ייעודית לכל ספק.
- שמירת `meta_message_id`, `media_id`, `wa_id` ו-caption במטא-דאטה, ללא access token או media URL זמני.

## 8. תבניות ראשונות להגשה ל-Meta

1. `document_request_vat_he` — בקשת מסמכים למע"מ עבור תקופה ותאריך יעד.
2. `document_request_reminder_he` — תזכורת אם המשימה עדיין פתוחה.
3. `document_received_he` — המסמך התקבל ונכנס לעיבוד.
4. `document_problem_he` — קובץ לא נתמך/לא קריא או נדרשת שליחה חוזרת.
5. `report_ready_for_client_action_he` — נדרשת פעולה של הלקוח.
6. `report_filed_he` — הדוח דווח בהצלחה.

דוגמה:

> שלום {{1}}, עבור דוח המע"מ של {{2}} לתקופה {{3}} יש לשלוח את המסמכים עד {{4}}. ניתן להשיב להודעה זו עם PDF או תמונה. לצפייה בסטטוס: {{5}}

הנוסח הסופי צריך להיות ספציפי לפעולה קיימת של הלקוח, ללא תוכן פרסומי, ולהיבדק ב-WhatsApp Manager. יש לכלול דרך ברורה להפסקת הודעות ולכבד `הסר`, `STOP` ובקשת הסרה חופשית.

## 9. התחברות ל-Meta — Checklist

1. ליצור/לאמת Meta Business Portfolio של TaxMyself.
2. ליצור Meta App מסוג Business ולהוסיף את מוצר WhatsApp.
3. ליצור WhatsApp Business Account ולחבר מספר ייעודי. לפני הבחירה יש לבדוק אם המספר כבר פעיל באפליקציית WhatsApp/WhatsApp Business ומהו מסלול ההעברה או ה-coexistence הזמין בחשבון.
4. לבצע ניסוי עם מספר הבדיקה וה-token הזמני ב-Getting Started.
5. ליצור System User ו-access token מתאים; להרשאות השליחה והניהול נדרשות בדרך כלל `whatsapp_business_messaging` ו-`whatsapp_business_management`.
6. לשמור ב-Secret Manager בלבד: token, app secret, verify token. לשמור בקונפיגורציה: Graph API version, WABA ID ו-phone-number ID.
7. להקים endpoint ציבורי HTTPS:
   - `GET /webhooks/meta/whatsapp` עבור challenge/verify token.
   - `POST /webhooks/meta/whatsapp` עבור הודעות וסטטוסים.
   - אימות `X-Hub-Signature-256` מול ה-App Secret ועל ה-raw body.
8. להירשם ל-webhook field `messages` ולבצע subscribe של האפליקציה ל-WABA.
9. להשלים ב-Meta את דרישות business verification, display name, רישום המספר ואמצעי התשלום כפי שיוצגו לחשבון.
10. ליצור ולהגיש תבניות בעברית, לבדוק את הסיווג ואת כפתורי הפעולה.
11. להעביר את האפליקציה למצב production/live רק לאחר בדיקות קצה-לקצה, ניטור ו-opt-in פעיל.

אם בעתיד מחברים WABA של כל רואה חשבון, עוברים ל-Embedded Signup. לפי תיעוד Meta למסלול זה יש להתחיל מוקדם App Review ו-Advanced Access להרשאות הרלוונטיות.

## 10. פרטיות, אבטחה ותפעול

- קבלת מספר טלפון מהלקוח אינה מספיקה: נדרש opt-in ברור שמציין קבלת הודעות ב-WhatsApp ואת שם העסק השולח.
- עצם שליחת מסמך על ידי הלקוח מאפשרת תשובה לשיחה בהתאם למדיניות, אך אינה תחליף להסכמה מתועדת להתראות יזומות עתידיות.
- opt-out נאכף בנקודה מרכזית לפני כל שליחה ובכל הערוצים שקוראים ל-NotificationService.
- access token אינו נשמר DB ואינו מופיע בלוגים.
- webhook נענה מהר; עבודה כבדה מתבצעת asynchronous.
- retry רק לשגיאות זמניות, עם exponential backoff ו-dead-letter לאחר מספר ניסיונות.
- סטטוס `failed` של Meta נשמר ומוצג; אין לסמן הודעה כהצלחה על בסיס תשובת ה-POST בלבד.
- הגבלת קצב ברמת המערכת וברמת רואה החשבון.
- קבצים נסרקים ומאומתים לפני OCR; filename ו-caption נחשבים input לא מהימן.
- מדיניות retention להודעות ולמטא-דאטה, מחיקת נתוני WhatsApp בבקשת משתמש, ותיעוד דרישות הדין הישראלי להגנת הפרטיות לפני production.
- dashboard תפעולי: שיעור delivery, failures לפי error code, opt-outs, איכות מספר/תבניות, backlog וזמן קליטה ממוצע.

## 11. שימושים חיוניים נוספים

### עדיפות גבוהה

- התראה שמסמך התקבל, כפול, לא קריא או שויך לעסק הלא נכון.
- תזכורת חכמה רק למסמכים/תקופות שעדיין חסרים, במקום broadcast זהה לכולם.
- כפתור "סיימתי לשלוח" שמעדכן `ReportWorkflow` ל-`READY_TO_PREPARE`.
- הודעה לרואה החשבון כאשר לקוח סיים, ועדיף digest מרוכז ולא הודעה על כל קובץ.
- הודעה ללקוח כשהדוח דווח, עם קישור מאובטח למסמך הקיים במערכת.
- קישור עמוק למסך הרלוונטי באפליקציה, עם אימות רגיל ולא token ארוך-חיים ב-URL.

### שלב מתקדם

- checklist אינטראקטיבי או WhatsApp Flow לבחירת עסק וסימון סוג המסמך.
- תשובות סטטוס קצרות: "מה חסר?", "איזה דוח פתוח?" — מתוך נתוני מערכת מוגדרים בלבד.
- inbox משותף למשרד עם הקצאת שיחה, הערות פנימיות ו-SLA.
- מסלול human handoff לבקשות שהבוט אינו מזהה.
- רב-לשוניות ותבניות לפי שפת הלקוח.

## 12. שלבי מימוש

### שלב 0 — החלטות מוצר וציות (2–3 ימים)

- לאשר מספר מרכזי לעומת מספר לכל משרד.
- להגדיר מי המותג השולח ומהו נוסח ההסכמה.
- להגדיר בעלות על מספר כאשר אותו מספר משמש כמה משתמשים/עסקים.
- להגדיר קטגוריות הודעה, quiet hours, retention ו-opt-out.
- לפתוח Business Portfolio/App/מספר בדיקה ב-Meta.

### שלב 1 — Spike מול Meta (2–4 ימים)

- שליחת template למספר בדיקה.
- קבלת webhook טקסט/תמונה/PDF ואימות חתימה.
- הורדת media ושמירת סטטוסי delivery.
- תיעוד ערכי הקונפיגורציה ומגבלות החשבון בפועל.

### שלב 2 — קליטת מסמכים MVP (שבוע עד שבועיים)

- מודול `whatsapp` ב-NestJS: controller, client, webhook parser ו-worker.
- טבלאות contact/message/webhook event.
- קישור מספר, זיהוי עסק, הורדת media.
- הרחבת `DocumentImportService` ל-`WHATSAPP`.
- הודעות אישור/שגיאה ובדיקות idempotency.

### שלב 3 — הודעות מערכת (שבוע)

- outbox ו-provider interface תחת `NotificationService`.
- חיבור אירועי `ReportWorkflow`.
- תבניות, opt-in/opt-out, סטטוסי מסירה ו-UI בסיסי להיסטוריה.

### שלב 4 — תזמון רואה חשבון (שבוע עד שבועיים)

- schedule/delivery entities ו-worker עמיד.
- מסך בחירת לקוחות, תבנית, משתנים וזמן.
- תנאי "רק אם טרם הושלם", ביטול, retry ו-audit.
- הרשאות Delegation ובדיקות עומס/כפילויות.

### שלב 5 — Pilot וייצוב (שבוע)

- משרד רו"ח אחד ו-5–10 לקוחות שהסכימו במפורש.
- ניטור תקלות, איכות תבניות, חסימות, opt-outs ועלות בפועל.
- שיפור UX לפני פתיחה לכל המשתמשים.

הערכה גסה: 4–7 שבועות למפתח full-stack אחד עד pilot יציב, לא כולל זמני אישור/אימות של Meta ושינויים משפטיים.

## 13. קריטריוני קבלה ל-Pilot

- webhook זהה שמתקבל מספר פעמים יוצר הודעה ומסמך אחד בלבד.
- קובץ שכבר הגיע מ-Drive/Gmail מזוהה ככפול גם ב-WhatsApp.
- שולח לא מזוהה אינו יכול להעלות מסמך לעסק.
- משתמש עם כמה עסקים אינו משויך אוטומטית לעסק הלא נכון.
- PDF/JPEG/PNG תקינים מגיעים ל-Drive וממשיכים ל-OCR הקיים.
- opt-out מונע כל הודעה יזומה עתידית.
- רואה חשבון ללא Delegation פעיל אינו יכול ליצור או לשלוח הודעה ללקוח.
- restart או שני workers אינם מייצרים משלוח כפול.
- sent/delivered/read/failed מוצגים בהתאם ל-webhooks של Meta.
- token, app secret, media URL ותוכן מסמך אינם דולפים ללוגים.
- ניתן לכבות את ערוץ WhatsApp ב-feature flag בלי לפגוע ב-Drive, OCR או email.

## 14. מדדי הצלחה

- אחוז הלקוחות שקישרו WhatsApp ונתנו opt-in.
- אחוז המסמכים שנקלטו בהצלחה, זמן webhook-to-Drive ושיעור כפילויות.
- ירידה בזמן עד השלמת מסמכים לכל תקופת דיווח.
- delivery/read/failed לפי תבנית.
- opt-out/block/report rate.
- מספר תזכורות ממוצע עד השלמה.
- עלות Meta למסמך שנקלט ולתקופת דיווח שהושלמה.

## 15. מקורות Meta

- [WhatsApp Cloud API — האוסף הרשמי של Meta](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
- [Webhook payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Media endpoints וסוגי קבצים](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3)
- [Webhook subscriptions ל-WABA](https://www.postman.com/meta/whatsapp-business-platform/folder/ypn8q0n/webhook-subscriptions)
- [Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)
- [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy/)
- [WhatsApp Business Platform pricing](https://business.whatsapp.com/products/platform-pricing)

יש לבדוק מחדש את מדיניות Meta, מגבלות החשבון והתמחור סמוך לעלייה ל-production; הם משתנים לאורך זמן.

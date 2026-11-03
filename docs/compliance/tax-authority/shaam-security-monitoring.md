# ניטור והתראות אבטחה — חיבור שע״מ

עודכן לאחרונה: 2026-10-18. מסמך זה מגדיר את שכבת הגילוי שמזינה את
[`shaam-security-incident-runbook.md`](shaam-security-incident-runbook.md).
הוא אינו מעיד שההתראות כבר הוגדרו בפרויקט Google Cloud: קוד האירועים מוכן,
אך יצירת Notification Channel ו-Alert Policies בפרויקט production היא פעולה
חיצונית ידנית שטרם בוצעה.

## בעלים וניתוב

- מנהל אירוע: אלעזר הראל.
- ממלא מקום: שמואל הראל.
- ערוץ התראה ראשי: `info@keepintax.co.il`.
- יש להגן על תיבת הדוא״ל ב-2FA ולוודא שהיא מנוטרת גם כאשר אלעזר אינו זמין.
- אין לכלול בהתראה טוקנים, סודות, business number, Firebase UID, query
  string, request body, signed URL או תגובת API מלאה.

## אירועי האפליקציה

הבקאנד פולט רשומת JSON מוגבלת עם `event=security_event` ו-`securityEvent`.
Nest עשוי לעטוף אותה בשורת טקסט, ולכן מסנני Cloud Logging חייבים לתמוך הן
ב-`jsonPayload` והן ב-`textPayload`.

| אירוע | משמעות | טיפול |
|---|---|---|
| `shaam_owner_only_denied` | רואה חשבון, מנהל מתחזה או actor אחר ניסה לבצע פעולה חיצונית מול שע״מ | התראה מיידית |
| `shaam_oauth_callback_owner_mismatch` | ה-OAuth callback אינו תואם עוד לבעל העסק | התראה מיידית והפעלת הנוהל |
| `shaam_reauthorization_state_update_failed` | שע״מ דחה הרשאה והמערכת לא הצליחה לבטל מקומית את החיבור | התראה מיידית |
| `shaam_connection_reauthorization_required` | שע״מ דחה את הטוקן והחיבור סומן לחיבור מחדש | התראה לפי קצב; אירוע יחיד עשוי להיות תפעולי |
| `auth_invalid_firebase_token` | Firebase דחה ID token | התראה לפי קצב |
| `auth_missing_bearer_token` | endpoint מוגן נקרא ללא Bearer token | התראה לפי קצב |
| `auth_mfa_required_denied` | בקשה נחסמה משום שאין הוכחת second factor | התראה לפי קצב לאחר הפעלת 2FA |
| `authorization_delegation_denied` | ניסיון התחזות ללקוח ללא delegation פעיל | התראה מיידית או לפי קצב |
| `authorization_delegation_scope_denied` | delegation קיים ניסה פעולה מחוץ ל-scope | התראה לפי קצב |
| `authorization_represented_client_approval_denied` | בעל עסק מיוצג ניסה לבצע החלטת אישור השמורה לרואה החשבון | מעקב לפי קצב |
| `http_authorization_denied` | רשת ביטחון גלובלית לכל HTTP 401/403 | מדד קצב; עשוי להכפיל אירוע ממוקד |

האירועים אינם כוללים מזהי אדם או עסק. חקירה מצטלבת לפי timestamp, Cloud Run
revision ו-Cloud Trace/Audit Logs, בגישת need-to-know.

## מסנן בסיס ב-Logs Explorer

יש להחליף את `BACKEND_SERVICE_NAME` בשם שירות הבקאנד המאומת. אין להניח ששם
שירות מסוים הוא הבקאנד רק משום שהוא מופיע בפרויקט.

```text
resource.type="cloud_run_revision"
resource.labels.service_name="BACKEND_SERVICE_NAME"
(
  jsonPayload.event="security_event"
  OR textPayload=~"\"event\":\"security_event\""
)
```

לפני יצירת alert, מריצים את המסנן ובודקים ידנית שרשומה צפויה נמצאת ושאין בה
מידע אסור.

## Policies נדרשות

### 1. SHAAM boundary — מיידי

צור Log-based alert שמתריע על הופעה אחת של אחד מהאירועים:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="BACKEND_SERVICE_NAME"
(
  jsonPayload.securityEvent="shaam_owner_only_denied"
  OR jsonPayload.securityEvent="shaam_oauth_callback_owner_mismatch"
  OR jsonPayload.securityEvent="shaam_reauthorization_state_update_failed"
  OR textPayload=~"\"securityEvent\":\"(shaam_owner_only_denied|shaam_oauth_callback_owner_mismatch|shaam_reauthorization_state_update_failed)\""
)
```

- חומרה: Critical.
- יעד: `info@keepintax.co.il`.
- פעולה: פתיחת הנוהל מיד; owner mismatch הוא חשש לאירוע גם ללא הוכחת דלף.

### 2. Authentication/authorization burst — מדד קצב

צור counter log-based metric בשם `security_auth_denied_count` עבור כל
`security_event` ששמו מתחיל ב-`auth_` או `authorization_`, וכן
`http_authorization_denied`.

- סף פתיחה התחלתי: 10 אירועים ב-5 דקות.
- חומרה: Warning; 50 אירועים ב-5 דקות מצדיקים policy נוסף ברמת Critical.
- יש לכוונן אחרי שבוע של baseline; אין להעלות סף רק כדי להשתיק רעש בלי לבדוק
  את מקורו.

### 3. SHAAM reauthorization burst

צור counter metric בשם `shaam_reauthorization_required_count` עבור
`shaam_connection_reauthorization_required`.

- סף פתיחה התחלתי: 3 אירועים ב-15 דקות.
- פעולה: בדיקת תקינות טוקנים, שינוי portal/configuration או דחייה רוחבית מצד
  שע״מ. אירוע יחיד אינו מוכיח תקיפה.

### 4. Backend 5xx

צור policy על מדד הבקשות המובנה של Cloud Run עבור קודי 5xx של שירות הבקאנד.

- סף פתיחה התחלתי: לפחות 5 תגובות 5xx ב-5 דקות וגם שיעור שגיאות מעל 5% כאשר
  יש די תעבורה למדידה.
- הפעל גם uptime check ל-endpoint בריאות שאינו חושף מידע, אם קיים.

### 5. שינוי Cloud Run או IAM — מיידי

צור Log-based alerts על Cloud Audit Logs עבור:

```text
protoPayload.methodName="google.cloud.run.v2.Services.UpdateService"
OR protoPayload.methodName="google.cloud.run.v2.Services.SetIamPolicy"
```

ה-alert חייב לציין מי ביצע את השינוי, אך אין להעתיק secrets מתוך התצורה
לדוא״ל. שינוי מתוכנן מאומת מול חלון deployment; שינוי לא מתוכנן מפעיל את
הנוהל.

### 6. Secret Manager

יש לוודא ש-Data Access audit logs מופעלים עבור Secret Manager לפני שמסתמכים
עליהם. לאחר מכן:

- alert מיידי על `AddSecretVersion`, שינוי IAM, disable או destroy שאינם חלק
  מחלון תחזוקה מאושר;
- metric לפי קצב עבור
  `google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion`;
- alert מיידי כאשר ה-caller אינו ה-Cloud Run service account המאושר או אדם
  מורשה בחלון תחזוקה מתועד.

## סדר הקמה ב-Google Cloud Console

1. Monitoring → Alerting → Edit notification channels.
2. הוסף `info@keepintax.co.il`, אשר את ההודעה שהתקבלה ובצע Test notification.
3. Logging → Logs Explorer: אמת כל filter על נתוני dev/staging.
4. ל-alert של אירוע בודד בחר Create alert מתוך Logs Explorer.
5. לספי קצב: Logging → Log-based Metrics → Create metric מסוג Counter, ואז
   Create alert from metric.
6. הדבק בתיעוד כל policy את קישור הנוהל, שם מנהל האירוע וממלא המקום.
7. הגדר auto-close רק לאחר חלון שמאפשר חקירה; סגירה אוטומטית אינה סגירת
   אירוע אבטחה.

## בדיקה בטוחה

1. פרוס תחילה לסביבת dev/staging.
2. קרא endpoint מוגן ולא-משנה-מצב עם Bearer token פיקטיבי.
3. ודא שנוצר `auth_invalid_firebase_token` ו-`http_authorization_denied`, ללא
   הטוקן, Firebase UID, business number או query string.
4. ודא שההתראה התקבלה ב-`info@keepintax.co.il` ושאלעזר ושמואל יודעים לפתוח
   את הנוהל.
5. אין לבדוק owner mismatch באמצעות שינוי OAuth state אמיתי ואין לשלוח נתוני
   דמה לשע״מ production.
6. לאחר אימות, מחברים את אותן policies לשירות production ומבצעים בדיקת 401
   בטוחה בלבד מול endpoint קריאה מוגן.

## מצב ופתוחים

- [x] קטלוג אירועי אפליקציה בטוחים.
- [x] query strings אינם נרשמים עוד על ידי מסנן השגיאות הגלובלי.
- [x] מסננים, thresholds ונוהל בדיקה תועדו.
- [ ] Notification Channel אושר בפרויקט production.
- [ ] policies ומדדים נוצרו ונבדקו בפועל.
- [ ] Data Access audit logs של Secret Manager אומתו.
- [ ] service account allowlist תועד ונבדק.
- [ ] retention מוצפן ל-12 חודשים לפחות הוגדר ואומת.
- [ ] כתובת אירועי האבטחה הרשמית של שע״מ התקבלה בכתב.

## מקורות תפעוליים

- Google Cloud: Configure log-based alerting policies —
  <https://cloud.google.com/logging/docs/alerting/log-based-alerts>
- Google Cloud: Configure notifications for log-based metrics —
  <https://cloud.google.com/logging/docs/logs-based-metrics/charts-and-alerts>
- Google Cloud: Cloud Run audit logging —
  <https://cloud.google.com/run/docs/audit-logging>
- Google Cloud: Secret Manager audit logging —
  <https://cloud.google.com/secret-manager/docs/audit-logging>

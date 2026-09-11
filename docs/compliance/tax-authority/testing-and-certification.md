# בדיקות, רישום וקבלה

## עקרונות

- כל נתוני הבדיקה סינתטיים; אין מספרי עוסק/לקוחות אמיתיים ואין קריאה חיה
  בלי onboarding ואישור מפורש.
- מפרידים unit/contract tests, sandbox רשמי, סימולטור, review מקצועי וראיית
  production. הצלחה בשכבה אחת אינה מחליפה שכבה אחרת.
- כל run שומר input, output, גרסת spec/תוכנה, timestamp, environment, hash,
  reviewer והחלטה. סודות וטוקנים לעולם אינם בראיה.

## חבילת בדיקות אוטומטית

1. **מספור:** מקביליות, retry, כשל באמצע, uniqueness לפי עסק/סוג; לאחר
   issuance אין delete/rewind/reuse. ביטול וזיכוי שומרים parent chain.
2. **מסמכים:** golden PDF/structured payload לכל סוג ולשילובי VAT, מטבע,
   ניכוי, אמצעי תשלום, מקור/העתק ומספר הקצאה; schema validation ושדות חובה.
3. **חתימה:** hash לפני/אחרי, שרשרת תעודה, expiry/revocation, שינוי byte אחד,
   viewer/verifier חיצוני, שמירת המקור והסכמה.
4. **הקצאה:** effective-date boundary, סף בדיוק/מעל/מתחת, idempotency,
   duplicate invoice ID, timeout, 4xx/5xx, delayed allocation, wrong tenant,
   revoke/refresh. בדיקות חוזה נגזרות מה-spec, לא מהיישום.
5. **VAT/PCN874:** סוגי רשומה, אורכים/קידוד, סכומים, 9 ספרות הקצאה,
   header/closing, תיקון תקופה ו-control totals מול היומן.
6. **קובץ אחיד:** כל record type נתמך, fixed widths, encoding, null/sign,
   counts/totals, INI↔BKM consistency, large set, deterministic output,
   business isolation ו-no-hardcoded-catalog-data.
7. **API קובץ אחיד:** sandbox בלבד — OAuth scopes, URL expiry, POST/PUT,
   INI/BKM pair, size headers, retry ללא duplicate, `fileUniqueId`, polling,
   rejected/invalid/timeout ו-audit redacted.
8. **אבטחה:** object authorization matrix, IDOR, tenant leakage, secret scan,
   log redaction, 2FA, encrypted token store, key rotation, audit access,
   rate limits ו-session invalidation.
9. **שמירה:** restore למדגם סינתטי, חתימות עדיין ניתנות לאימות, קישורים
   עקביים, retention/hold, גיבוי רבעוני וכשל region/provider.

## בדיקות ידניות מקצועיות

- רו״ח/יועץ מס מאשר field map, סוגי מסמך, מועדי הוצאה, זיכוי/ביטול,
  VAT/PCN874, ספים והתאמת journal/report.
- עו״ד מאשר applicability, נוסח הוראות עדכני, חתימה/הסכמה, מקום/משך שמירה,
  פרטיות, ספק PDF/ענן והתחייבויות SHAAM.
- security reviewer מאשר threat model, OAuth/tenant binding, secret handling,
  incident evidence ודרישות PT של נספח האבטחה.
- QA מריץ E2E: issue → sign/deliver → allocation → journal → VAT/PCN874 →
  uniform → correction/credit → audit export, כולל כשל בכל גבול חיצוני.

## מסלול רשמי

1. להכריע אם חלה חובת רישום תוכנה. דף הרישום S12 והוראה S03 הם נקודת
   פתיחה; אין להסתמך על מסמך זה במקום רשות המסים/ייעוץ מוסמך.
2. אם חלה: להכין עותק/מהדורה מזוהה, ספרות מקצועית ופלטים כנדרש; להריץ
   סימולטור S13 על קובץ 1.31 עם לפחות 2,000 רשומות ועד 4MB ולשמור את קובץ
   המשוב לצירוף לבקשה.
3. לזכור: תעודת הרישום תקפה, לפי S03, לשלוש שנות מס אך אינה מעידה על
   נכונות ביצועי התוכנה או התאמתם להוראות. שינוי מהדורה עשוי לדרוש רישום.
4. ל-SHAAM: להשלים נוהל חיבור S08, נספח אבטחה S09, הרשאות דיגיטליות
   ו-sandbox. אין production עד שהרשות מאפשרת, החוזה הנוכחי אומת וכל שערי
   האבטחה עברו.
5. ל-API הקובץ האחיד: S05 מהדורה 1.0/3.2026 מציינת Sandbox בלבד ו-Production
   “יופעל בקרוב”. יש לקבל הודעה/תיעוד רשמי עדכני; אין לנחש מועד תחולה.

## תיק ראיות לשחרור

`release-id`, commit/build digest, source-index snapshot, applicability memo,
signed review, test results, simulator feedback, sandbox receipts, PT evidence
לפי תחולה, incident/backup runbooks, restore result, known deviations,
go/no-go ו-expiry dates. תיק הראיות עצמו מוצפן, מוגבל הרשאות ונקי מסודות.

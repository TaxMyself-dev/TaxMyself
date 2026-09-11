# פערים ומפת דרך

זהו backlog ראייתי בלבד. הוא אינו מאשר שינוי קוד, מוצר, חשבונאות, סכימה
או ייצור. כל שער דורש משימה נפרדת ואישור manager; הכרעות משפטיות/חשבונאיות
שייכות למומחה מוסמך.

## P0 — חסמי ייצור/ציות

1. **שלמות מסמך ומספור.** מסלול rollback מוחק מסמך, שורות ותשלומים ומחזיר
   מוני מספור. יש להגדיר במדויק מתי מסמך “הופק”, ואז לאפשר רק ביטול/זיכוי
   מתועד, בלי מחיקה או שימוש חוזר במספר. נדרשים event ledger בלתי-מחיק,
   actor/reason/time/hash ובדיקות race/retry.
2. **מסמך ממוחשב.** PDF שנשלח כיום אינו מוכח כמסמך ממוחשב: לא נמצאו
   חתימה מאובטחת/מאושרת, תווית, הסכמת מקבל, שמירת מקור חתום או אימות
   חתימה. עד הסגירה אין להבטיח תאימות למסמך ממוחשב.
3. **SHAAM אוטומטי — NO-GO.** להשאיר production automation כבוי. audit
   הקודם מצא token/browser, state, endpoint/version, tenant, logging ומיפוי
   חוזה לא בטוחים. נדרשים onboarding רשמי, authorization model, server-side
   vault, idempotency, contract tests, sandbox acceptance ו-go/no-go חתום.
4. **סודות, PII ולוגים.** נמצאה ראיה לחומר credential-like סטטי וללוגים
   רחבים בזרימות מסמך/SHAAM. אין להעתיק ערכים למסמכים. משימת אבטחה נפרדת
   תסיר ותסובב סודות, תנקה היסטוריה לפי נוהל מאושר, תוסיף redaction והצפנה.
5. **הרשאת אובייקט ובידוד דיירים.** מספר פעולות מסמך אינן מעבירות את זהות
   המשתמש לבדיקת בעלות; יצוא הקובץ האחיד כולל שאילתה שנראית רחבה מדי.
   נדרשת מטריצת authorization ו-negative tests לכל business/actor.
6. **Applicability ורישום.** לקבל חוות דעת אם המוצר חייב ברישום לפי הוראות
   ניהול פנקסים. אם כן, אין להצהיר ציות לפני רישום, סימולטור ותיק הראיות.
7. **תגובה לאירועי SHAAM.** לקבוע owner, 72-hour reporting workflow,
   annual review, PT applicability/remediation ושרשרת ראיה.

## P1 — התאמה פונקציונלית וקבלה

1. חוזה שדות לכל סוג מסמך ומקרה: מקור/העתק, תאריך/שעה, עסקה, תקבול,
   הקצאה, זיכוי, ביטול ותיקון; אישור רו״ח/עו״ד ובדיקות golden.
2. rule engine מתוארך לספי חשבוניות ישראל, חריגים ומקרי delayed allocation;
   10,000 ₪ עד 31.5.2026 ו-5,000 ₪ מ-1.6.2026 אינם hard-code נצחי.
3. התאמת PCN874 ודיווח מפורט: applicability לעסק, מפרט נוכחי, 9 ספרות
   הקצאה, control totals, קבלה ותיקונים לתקופה שדווחה.
4. בדיקת שדה-שדה של INI/BKM מול 1.31. להסיר ערכי קטלוג קשיחים, לוודא
   קידוד/אורך/סכומים/רשומות סיום ובידוד עסק. להריץ סימולטור על מידע סינתטי.
5. תוספת API לקובץ אחיד: לתכנן OAuth2, resumable upload, שמירת מזהים
   ו-status, אך לא לבצע production לפני הודעת הפעלה רשמית וחוזה סופי.
6. backup/restore: DB, מסמכים חתומים, הסכמות, acknowledgements, דוחות,
   גרסאות וקונפיגורציה; rehearsal רבעוני וראיה שמורה במקום הנדרש.
7. reconciliation תקופתי: מסמכים ↔ יומן ↔ VAT/PCN874 ↔ הקצאות ↔ קובץ
   אחיד, עם exception queue ונעילת תקופה/תיקון מוסכם.

## P2 — ממשל ותחזוקה

- register של גרסאות תוכנה, תעודות ותוקף; רשימת לק/לקוחות/לקוחות רק במידה
  הנדרשת ובבקרות פרטיות.
- register מקורות ו-alert רבעוני לשינויי law/spec/service page.
- data retention schedule מאושר; legal hold, מחיקה מותרת וייצוא ביקורת.
- הדרכת support/accounting, runbooks וראיית אישור לכל release רלו/incident.

## שערים מוצעים

| שער | ראיות מינימום | בעל אישור |
|---|---|---|
| G0 — הגדרת תחולה | נוסח הוראות מוסמך, מפת מוצר, חוות דעת כתובה | עו״ד + רו״ח/יועץ מס |
| G1 — document integrity | state machine, immutable audit, golden docs, rollback-negative tests | engineering + accounting |
| G2 — electronic document | חתימה/אימות, consent, originals, retention/restore | legal + security |
| G3 — reports/uniform | PCN874 validation, 1.31 simulator feedback, reconciliation | accounting + QA |
| G4 — SHAAM sandbox | onboarding, auth/tenant/security/PT, contract + failure tests | security + Tax Authority contact |
| G5 — production | הודעת endpoint/גרסה רשמית, תעודה/אישור ככל שנדרש, runbook ו-backout | manager בלבד |

אין לדלג על שער באמצעות “עובד ב-sandbox”. רישום תוכנה ותוצאת סימולטור אינם
חוות דעת שרשות המסים אישרה את נכונות התוכנה; האחריות לתאימות נשארת במוצר.

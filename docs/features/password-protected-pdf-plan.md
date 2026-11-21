# תוכנית: PDF מוגן בסיסמה והעלאת חלופה

מצב: המימוש אושר ונכתב ב־19.11.2026 בענף codex/protected-pdf. הפיצ׳ר כבוי והסכמה לא הוחלה. פרטי המימוש והבדיקות: protected-pdf.md. התכנון המקורי להלן נשמר לעיון; בפועל נבחרו שלוש טבלאות צד ללא שינוי עמודות קיימות.
אין בתוכנית אישור להריץ ייבוא/AI, להחיל סכמה או לשנות נתוני משתמשים. ללא PROD, main, Push או Deploy.

## מה קיים בפועל

- `backend/src/integrations/services/gmail-reader.service.ts`, `collectMessageAttachments`: הורדת קבצים, סינון טכני וחילוץ טקסט מקומי. הסיווג החדש PASSWORD_REQUIRED מבדיל שגיאת פתיחה של pdf.js מסוג PasswordException מכשל PDF אחר; זה עדיין אינו מסלול שמירת מסמך נעול או החלפה.
- `backend/src/integrations/utils/pdf-text-extraction.util.ts`: חילוץ מקומי מוגבל לעמודים/נפח/זמן; מגבלת העתקה אינה נחשבת סיסמת פתיחה כשהפרסר מצליח לקרוא. נדרש אימות מבני מלא נפרד להעלאת חלופה, לא להסתפק בטקסט מהעמודים הראשונים או בחתימת %PDF.
- `backend/src/integrations/services/gmail-drive-import.service.ts`, `importFromGmail`: העברת הקובץ ומטא-דאטה של Gmail לשירות הקליטה. מסמך נעול אינו נשמר כיום עם סטטוס עסקי ייעודי; הוא נשאר לא פתור ואינו נשלח ל-AI.
- `backend/src/document-import/document-import.service.ts`, `importDocument`: hash SHA-256, dedup לפי משתמש+עסק+תוכן, שמירה ב-Drive ורישום ב-imported_documents. יש התאוששות מקובץ שכבר הועלה, אימות תוכן ופיצוי על כשל רישום; אין קישור החלפה.
- `backend/src/document-import/entities/imported-document.entity.ts`: מזהה פנימי יציב, מקור הייבוא, משתמש/עסק, hash, Drive ומזהי Gmail. אין שדות מצב קליטה/מקור חלופי/שרשרת החלפה.
- `backend/src/documents/documents.service.ts`, `processInboxForUser`: נעילת MySQL לכל עסק ו-claim עמיד ב-extracted_document לפני AI; תוצאה וכשל נרשמים. תיקיית INBOX נסרקת אוטומטית, לכן אסור לשים בה מקור נעול או חלופה שטרם חוברה בעסקה.
- `backend/src/documents/extracted-document.entity.ts`: סטטוס varchar32, תוצאות OCR ומזהה Drive. אין זהות מסמך לוגי/שרשרת החלפה. שינוי enum TypeScript לבדו אינו מספיק כדי להוסיף תהליך החלפה בטוח.
- `backend/src/google-drive/google-drive.service.ts`: clients נפרדים לתיקיות ולפעולות קבצים, הורדה/העלאה/העברה/מחיקה. אין commit משותף ל-Drive ולמסד; אין להבטיח אטומיות בין שניהם.
- `backend/src/documents/documents.controller.ts`: `me/upload-to-inbox` הוא העלאה חדשה, לא החלפה לפי מזהה מקור. `me/ocr-file` מפעיל עיבוד, ולכן אינו endpoint מתאים לאימות חלופה.
- `backend/src/documents/documents.service.ts`, `getArchivedForUser`: רשומות OCR וגם projection של קבצי INBOX שטרם עובדו. מזהי projection עלולים להיות שליליים/סינתטיים; לא להשתמש בהם כמזהה החלפה קבוע.
- `frontend/src/app/services/drive-docs.service.ts` ו-`frontend/src/app/pages/book-keeping/archived-documents/archived-documents.page.ts`: מודלי הרשימה, תגי סטטוס ופעולות. קיימים pending/error/rejected; אין PASSWORD_REQUIRED, כפתור החלפה או אישור התאמת החלופה.

## ארכיטקטורה ושינויי סכמה מוצעים

מומלץ להשאיר את חיבור Gmail למשתמש ללא שינוי. החלפה היא פעולה על מסמך של עסק, לא על החיבור.

1. להוסיף ל-imported_documents מצב קליטה מפורש (`READY`, `PASSWORD_REQUIRED`, `REPLACED`) ו-link למקור/מסמך השורש ולחלופה הפעילה. לא לשנות hash, מזהה Drive או מטא-דאטה היסטוריים של המקור. אם ערוץ ידני אינו נרשם כיום ב-ledger, להוסיף רישום משותף לפני תמיכה בהחלפה עבורו; לא להניח שלכל extracted_document יש imported_document.
2. טבלת `document_replacement_operations`: original_import_id, replacement_import_id nullable, owner, business, actor, idempotency_key, status, candidate_drive_id, expected_original_version, timestamps, error_code ו-processing outcome נפרד. unique של מקור+idempotency; מקור נעול במצב בחירה/עדכון מותנה מבטיח שרק חלופה פעילה אחת תאושר.
3. outbox עמיד לעיבוד החלופה/העברה מ-staging ל-INBOX, עם מזהה פעולה ייחודי ו-retry מוגבל. אם נבחר תור קיים במיפוי המשלים, יש להוכיח שהוא עמיד ו-idempotent לפני שימוש; לא להוסיף פעולת רקע שנשמרת בזיכרון בלבד.
4. `extracted_document` יקבל מיפוי לזהות intake יציבה וסטטוס נעילה כשהמקור מופיע ברשימה. הסטטוס הנעול לא יתערבב עם ERROR, ולא יהיה זכאי ל-AI או אישור הוצאה. שדות המקור/חלופה ב-ledger הם מקור האמת; אין ליצור כמה מקורות אמת עצמאיים לשרשרת.
5. להוסיף מונים לסיכום ייבוא: דורשי סיסמה, נשמרו לבדיקה, הועלו חלופות ועיבודים שנכשלו. שמירה עמידה של תוצאת ריצה ופירוט מוגבל נחוצים כדי לא להסתמך על stdout בלבד.

אלה הצעות DDL בלבד. יש להציג שמות/טיפוסים/אינדקסים סופיים ו-preflight לפני אישור להחלה על DEV. אין צורך בעמודת connection_environment; בסיסי הנתונים מופרדים.

## מחזור חיים והתאוששות

1. זיהוי סיסמת פתיחה -> שמירת המקור באזור `blocked` פרטי של העסק שאינו נסרק ב-OCR, ורישום PASSWORD_REQUIRED עם מקור Gmail. רק לאחר שמירה עמידה ניתן לסיים טיפול קליטה בקובץ ולהתקדם בסמן. אם שמירת המקור נכשלת, אין להתקדם. מגבלת העתקה בלבד אינה מעכבת קריאה.
2. המסמך מוצג בכתום עם פעולה "העלה עותק ללא הגנה". בחירת הפעולה מעבירה מזהה imported_document חיובי ויציב, עסק ואישור משתמש מפורש שהעותק הוא של אותו מסמך. אין חיפוש/קישור לפי שם או hash.
3. endpoint multipart ייעודי למקור: אימות actor/effective owner, הרשאות העסק לפי מנגנון הייצוג הקיים, סטטוס PASSWORD_REQUIRED, מזהה idempotency, גודל/MIME/חתימת PDF, פתיחה ללא סיסמה ובדיקה מבנית מוגבלת לכל המסמך. מגבלות parse וזמן מסווגות כאי-יכולת לאמת, לא כ-PDF תקין.
4. עסקה קצרה שומרת reservation עם version/lease. אין להחזיק עסקת DB או lock בזמן העלאת רשת. העלאת הקובץ ל-staging פרטי, מחוץ ל-INBOX. נשמר candidate_drive_id להתאוששות.
5. עסקה שנייה מותנית ב-version מאשרת קשר מקור-חלופה ושמירת provenance, ומוסיפה outbox. המקור נשמר אך מסומן REPLACED; החלופה מסומנת "הועלתה, ממתינה לעיבוד". הרשימה מציגה מסמך לוגי אחד, עם היסטוריית גרסאות נגישה.
6. worker idempotent מעביר/מנגיש את החלופה ל-INBOX רק אחרי commit. עיבוד קיים משתמש ב-claim ובנעילה; העברה כפולה/אירוע כפול אינם מפעילים AI נוסף. הצלחת upload אינה הצלחת processing.
7. אם upload או אימות כשלו: המקור נשאר PASSWORD_REQUIRED, ללא REPLACED. אם ההעלאה הצליחה וה-commit כשל: פעולה ניתנת להתאוששות לפי reservation ו-candidate_drive_id; ניקוי רק של קובץ staging שהפעולה עצמה יצרה, לעולם לא של המקור או קובץ של פעולה אחרת.
8. אם commit הצליח והעברת Drive נכשלה: outbox חוזר על אותה העברה, ללא upload חדש. אם OCR נכשל: החלופה נשמרת עם שגיאה והמקור נשאר נגיש בהיסטוריה; לא מציגים שוב את המקור כמשימה נוספת. ניתן לאשר ניסיון/חלופה חדשה במפורש לפי אותו מסמך לוגי.
9. אותו idempotency_key מחזיר אותה פעולה. שתי חלופות במקביל: רק אחת מאושרת, השנייה מקבלת conflict ותוצר ה-staging שלה מטופל בנפרד. hash משמש dedup בלבד: אם החלופה כבר משויכת למסמך אחר, מחזירים conflict ולא מאחדים בעלויות/מסמכים. retry של אותה פעולה חוזר לאותה חלופה.
10. אין מחיקה מיידית של המקור. מדיניות retention/מחיקה תוגדר בנפרד עם אישור; אין סיסמאות במסד, בממשק או בלוגים.

## אבני דרך ובדיקות לפי סיכון

| שלב | תוצר | אימות ממוקד | מאמץ משוער |
|---|---|---|---|
| 1 | זיהוי פתיחה/נזק/הרשאות ו-model סופי | PDF נעול בסיסמת פתיחה, permissions-only שנפתח, סרוק, פגום, timeout וגדול; fixtures מלאכותיים | 1-2 ימי פיתוח |
| 2 | DDL מאושר, קליטה עמידה וסטטוס PASSWORD_REQUIRED | isolation משתמש/עסק, idempotency, כשל Drive/DB, אין AI למקור, אין cursor advance על כשל שמירה | 2-3 ימים |
| 3 | API חלופה + reservation/staging/outbox | זיוף מזהה עסק, הרשאה חסרה, שתי העלאות, אותו מפתח, אותה חלופה במסמך אחר, נפילה בכל גבול חיצוני | 2-3 ימים |
| 4 | ממשק כתום + אישור + היסטוריה וסטטוס עיבוד | desktop/mobile, מסמך אחד ברשימה, כפתורים לפי סטטוס והרשאה, שימור סטטוס אחרי רענון | 1-2 ימים |
| 5 | המשך עיבוד ומבחן התאוששות | כפילות queue/worker, כשל OCR אחרי upload מוצלח, provenance Gmail נשמר, בדיקת DEV מצומצמת רק באישור | 1-2 ימים |

הטווחים תלויים בתשתית outbox הקיימת ובהיקף ערוצי הקליטה; אינם התחייבות לזמן קלנדרי.

## Worktree והחלטות לאישור

את סינון המייל וה-AI המוגבל משלימים ב-Worktree הקיים. למנגנון ההחלפה כדאי Worktree נפרד בגלל הסכמה, שינויי lifecycle וממשק הארכיון. לאחר אישור, להגדיר במפורש בסיס הכולל את שינויי האינטגרציה המאושרים ולהכין סביבה מקומית נפרדת בלי לגעת בענף סוכן ה-AI.

נדרש לאשר: היקף Gmail בלבד או כל ערוצי הקליטה בגרסה הראשונה; schema ושימוש במזהה ledger יציב; מדיניות מקור retained; תכנון outbox; ותנאי בדיקת DEV. אין לממש או להחיל את מנגנון ההחלפה לפני אישור התוכנית.

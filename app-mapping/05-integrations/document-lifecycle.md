# מחזור חיי מסמכים

יש שני מסלולים שונים: מסמך שמתקבל מספק (`ExtractedDocument`) ומסמך שהעסק מנפיק (`Documents`). אין לראות בתוצאת OCR חשבונית שהמערכת הנפיקה.

## קבלת מסמך

1. Gmail סורק מצורפים לפי סוג, מטא־נתונים ומילות מפתח; ל־PDF קיימת בדיקת שכבת טקסט כ־fallback. זהו סינון דטרמיניסטי, ללא LLM. Mailgun מאמת חתימה וכתובת עסק. קובץ יכול להגיע גם ישירות ל־Drive או בהעלאה ידנית.
2. Gmail ו־Mailgun עוברים דרך `DocumentImportService`: בחירת עסק, SHA-256, dedup לפי משתמש+עסק+תוכן, העלאה ל־inbox ורישום `ImportedDocument`. כשל ברישום לאחר העלאה גורר ניסיון ניקוי הקובץ. אין כאן יצירת הוצאה או OCR. אין להניח שכל מסלול ידני עובר בשירות רק מפני שהערה בקוד מתארת גבול intake משותף.
3. `DocumentsService.processInboxForUser` בונה קטלוג עסקי, מזהה כפילויות ומוריד קובץ. `DocumentProcessorService.extract` שולח PDF/תמונה ל־Claude ומקבל מערך חשבוניות. קובץ יחיד עשוי ליצור כמה רשומות עם `subIndex`.
4. נשמרים חילוץ, מקור, מטבע, תגובת מודל גולמית וסטטוס. הצלחה ממתינה לבדיקה; קבצים שעובדו מועברים ל־processed. ERROR עשוי להישאר ב־inbox לניסיון נוסף. העלאה מחדש של תוכן שנמחק רכות יכולה לשחזר רשומה קיימת.
5. `DocumentPairingService` מצמיד חשבונית וקבלה; `MatchingService` מתאים מסמכים לתנועות. אלה אלגוריתמים בקוד ולא קריאות AI נוספות.
6. משתמש מוסמך סוקר ומתקן. אישור הוצאה פותר מיפוי חשבונאי, מקבע snapshot ורושם יומן דרך שכבת ההוצאות; מסמך שנתי מתויק במסלול נפרד ואינו יוצר הוצאה או יומן.

מקורות: `backend/src/integrations/services/gmail-reader.service.ts`, `backend/src/inbound-email/mailgun-inbound.controller.ts`, `backend/src/document-import/document-import.service.ts`, `backend/src/documents/documents.service.ts`, `backend/src/documents/document-pairing.service.ts`, `backend/src/reports/matching.service.ts`, `backend/src/reports/reports.service.ts`.

## מצבי מסמך נכנס

`pending_review`, `approved`, `archived`, `rejected`, `paired`, `error`, `not_an_expense` מוגדרים ב־`backend/src/documents/extracted-document.entity.ts`. `deletedAt` הוא ציר נראות עצמאי: מחיקה רכה אינה מחיקת קובץ Drive או ביטול קשרים חשבונאיים. במצב pair החלק המשני מוסתר והחלק הראשי מייצג את הצמד; שינוי מצב יכול להתפשט לבן הזוג.

## הנפקה יוצאת

טיוטה → ולידציה והכנת נתונים → שמירת כותרת/שורות/תשלומים ומספר רשמי. אם נדרשת הקצאה, המסמך נשמר כ־`PENDING_ALLOCATION`; SHAAM שומר מספר הקצאה לפני finalization. בהשלמה נוצר PDF, נחתם באמצעות FillFaster, נשמר באחסון ונוצר הרישום החשבונאי המתאים לסוג המסמך. תצוגה מקדימה אינה חתומה. ניסיון חוזר לאחר שמירת הקצאה אינו אמור לשלוח Approval חדש.

מקורות: `backend/src/documents/documents.service.ts`, `backend/src/documents/pdf/document-pdf-renderer.service.ts`, `backend/src/documents/pdf/fillfaster-signer.service.ts`, `backend/src/shaam/services/shaam-document-allocation.service.ts`. סמכות המודל החשבונאי: `docs/redesign/categories-redesign-master-plan.md`, במיוחד D6–D10.

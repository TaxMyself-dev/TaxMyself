# תהליכים עסקיים

## הצטרפות ותחילת עבודה

משתמש נכנס באמצעות Firebase ונוצר או נטען המשתמש העסקי בשרת. הגדרות העסק קובעות סוג עסק ותקופות דיווח. מנוי והרשאות מודול משפיעים על הגישה. `UsersService` מטפל גם בהקמת תיקיות Drive; זו תלות חיצונית עם אפשרות לכישלון נפרד מההרשמה. רואה חשבון יכול ליצור לקוח במסלול `DelegationService`, המקשר משתמש, עסק, מנוי והרשאת ייצוג.

מקורות: `backend/src/users/users.service.ts`, `backend/src/users/auth.service.ts`, `backend/src/delegation/delegation.service.ts`.

## מקובץ להוצאה

המשתמש מעלה קובץ או שהוא מגיע מ־Gmail/דואר נכנס. קליטת הקובץ ל־Drive והחילוץ החשבונאי הם שלבים נפרדים. Claude מחלץ מסמכים ומציע סיווג מתוך הקטלוג. רשומות `ExtractedDocument` ממתינות לבדיקה; המערכת יכולה לצמד חשבונית וקבלה ולהציע התאמה לתנועת בנק.

במסך הבדיקה קיימים מסמך עם תנועה, מסמך ללא תנועה ותנועה ללא מסמך. אישור משתמש מוסמך יוצר הוצאה עם snapshot של המיפוי ורישום יומן באותה טרנזקציית DB במסלולי האישור. סיווג חסר דורש השלמה. מסמך שנתי עובר לתיוק, לא להוצאה; מסמך לא מזוהה דורש הכרעה.

מקורות: `backend/src/documents/documents.service.ts`, `backend/src/reports/report-review.service.ts`, `backend/src/reports/matching.service.ts`, `backend/src/expenses/expenses.service.ts`.

## מתנועה להוצאה

לאחר הסכמה לשירות הבנקאות, Feezback מספק תנועות. `TransactionProcessingService` משמר שכבת slim עמידה ושכבת cache לתצוגה, ומפעיל סיווג לפי כללים. סיווג או שינוי כלל אינם אישור הוצאה. אישור במסך התנועות או הבדיקה מקדם את התנועה ל־`Expense` וליומן דרך `ExpensesService`.

עסק מיוצג יכול להכין ולסווג חומר בהתאם לחריגים המפורשים בקוד, אך אישור חשבונאי דורש `EXPENSES_APPROVE`. תנועה שננעלה בעקבות דיווח אינה ניתנת לסיווג מחדש במסלול הרגיל.

מקורות: `backend/src/transactions/transaction-processing.service.ts`, `backend/src/transactions/transactions.service.ts`, `backend/src/guards/firebase-auth.guard.ts`.

## מהפקת מסמך להכנסה

העסק מזין לקוח, פריטים ותשלומים. השרת מקצה מספר רשמי תחת נעילה ושומר מסמך ושורות. לסוגים המתאימים נבנית פקודת יומן. PDF מקור והעתק נוצרים, נחתמים ונשמרים. במסמך הממתין להקצאה נשמרת הזהות הרשמית, והשלמת PDF ויומן נדחית. SHAAM משתמש בנתוני המסמך שנשמרו; מספר שהוחזר נשמר לפני finalization כדי לאפשר ניסיון השלמה חוזר.

טרנזקציית DB אינה הופכת את חתימת הספק, אחסון הקבצים או משלוח הדואר לטרנזקציה מבוזרת אחת. קיימים טיפול בכשל וניקוי לפי המסלול.

מקורות: `backend/src/documents/documents.service.ts`, `backend/src/shaam/services/shaam-document-allocation.service.ts`.

## מהכנת תקופה לדיווח

חובות דיווח ומשימות נוצרות לפי העסק והתקופה. בעל העסק מאשר שסיים להעביר חומר; רואה החשבון בודק הוצאות ומפיק דוחות. `ReportsService` מחשב מע״מ לפי תקופת שיוך למע״מ, ורווח והפסד לפי תאריך היומן והחתך החשבונאי. ניכוי מס, ציוד ופחת אינם אותו חישוב.

`ReportWorkflowService.setReported` משנה מצב, מסנכרן משימות ונועל רשומות; במע״מ מנסה גם לשמור PDF של הדוח. משתמש ללא ייצוג יכול לסמן דיווח בהתאם לתנאים. אין להסיק מסימון פנימי על אישור הגשה חיצונית. ביטול דיווח משחרר נעילות בהתאם למסלול.

מקורות: `backend/src/report-workflow/report-workflow.service.ts`, `backend/src/accountant-tasks/tasks-generator.service.ts`, `backend/src/reports/reports.service.ts`.

## הכנת חומר שנתי

שאלון מחשב קטגוריות מסמכים נדרשות. העלאת מסמכים נרשמת ב־`AnnualReportFile`; סיום נחסם אם חסרות כמויות נדרשות. נציג פעיל מסמן דיווח, מסנכרן משימות ונועל תנועות שנתיות מתאימות. זהו מסלול איסוף ומעקב; תיוק מסמך מתוך OCR אינו מוזן אוטומטית לרשימת הקבצים השנתית במימוש שנבדק.

מקור: `backend/src/annual-report/annual-report.service.ts`, ובנפרד `DocumentsService.fileDocumentAsAnnual`.

# KeepInTax — מפת יישום ליועץ ארכיטקטורה ו־AI

מיפוי תמציתי של המוצר, המימוש וגבולות המידע, בעברית. מפת הבסיס נבדקה ב־**20.10.2026** מול `main`, בסיס `0a74039bb98c8f4ad94da7565dcc659bc3399aa4`; נוספה בדיקה נפרדת של פיצ׳ר AI Chat שטרם מוזג. אין כאן אימות פריסה בייצור או שינוי מערכת.

## מה נמצא ב־main ומה עדיין בפיתוח

| מקור | worktree ו־commit שנבדקו | יכולות |
|---|---|---|
| MAIN | `C:/Users/user/Keepintax/TaxMyself`; `main`; `0a74039bb98c8f4ad94da7565dcc659bc3399aa4` | המוצר הקיים המתואר במפה; Claude לחילוץ וסיווג מסמכים. לא נמצא בו מודול הצ׳אט |
| AI-DEV | `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`; `new-ai-chat`; `8c30a975142816ffafcb99f672786223d1044b92` | צ׳אט בעברית, orchestration, ארבעה כלי קריאה, Anthropic, sessions וזיכרון זמני, UI והרשאת עסק. מומש בקוד פיתוח; אינו מיזוג ל־main או אישור מוכנות לפריסה |

הסימון **AI-DEV** בכל מסמך מפנה בדיוק למקור ול־commit בטבלה. נתיבי הקוד שם יחסיים לשורש worktree זה; הפניות ללא סימון ממשיכות לתאר את MAIN. **חלקי:** readers של accounting/cashflow מלאים ו־resolvers נוספים. **מתוכנן / לא אומת:** יכולות ללא מסלול מחובר, תצורה חיה, איכות ותוצאות בדיקה שלא הורצו. ראו [מפת פיתוח AI Chat](06-ai/development-ai-chat.md).

## מסלול הכנה של 15–20 דקות

1. **3 דקות:** [מה המוצר עושה](01-product/product-overview.md) ו־[תפקידים וגבולות מידע](01-product/user-roles.md).
2. **4 דקות:** [מלאי יכולות ומצבן](01-product/feature-inventory.md).
3. **4 דקות:** [תרשימי מערכת](07-system/architecture-diagrams.md) ו־[תהליכים עסקיים](01-product/business-workflows.md).
4. **4 דקות:** [AI קיים](06-ai/current-ai-architecture.md) ו־[נקודות הרחבה אפשריות](06-ai/ai-extension-points.md).
5. **3 דקות:** [מגבלות ושאלות פתוחות](07-system/known-limitations.md).

## נקודות המפתח

זו מערכת Angular/NestJS עם MySQL דרך TypeORM ושירותי ענן חיצוניים. מסמך מקור, תנועת בנק, הוצאה ופקודת יומן הם אובייקטים נפרדים. אישור הוצאה מקבע מיפוי חשבונאי ויומן; נתוני OCR והצעות סיווג אינם אישור.

ב־MAIN קיים Claude לחילוץ וסיווג מסמכים. ב־AI-DEV קיימים בנוסף צ׳אט, tool registry, orchestration וזיכרון session בשרת. לא נמצא RAG או vector store בשני המקורות שנבדקו. כללי סיווג והתאמת מסמך לתנועה בליבת המוצר מבוצעים באלגוריתמים דטרמיניסטיים.

הרשאות משלבות בעל נתונים, עסק, תפקיד השחקן, delegation פעיל, scopes ומנוי. הרחבת AI עתידית צריכה לשמר גבולות אלה ואת ההבדל בין קריאה, הצעה ואישור פעולה כספית.

## מפת קריאה מלאה

| תחום | מסמכים |
|---|---|
| מוצר | [סקירה](01-product/product-overview.md), [תפקידים](01-product/user-roles.md), [יכולות](01-product/feature-inventory.md), [תהליכים עסקיים](01-product/business-workflows.md) |
| Frontend | [ארכיטקטורה](02-frontend/architecture.md), [נתיבים ומסכים](02-frontend/routes-and-screens.md), [מצב ושירותים](02-frontend/state-and-services.md) |
| Backend | [ארכיטקטורה](03-backend/architecture.md), [מודולים ושירותים](03-backend/modules-and-services.md), [אימות והרשאות](03-backend/authentication-and-authorization.md) |
| מסד נתונים | [מודל נתונים](04-database/data-model.md), [ישויות וקשרים](04-database/entities-and-relationships.md) |
| אינטגרציות | [שירותים חיצוניים](05-integrations/external-services.md), [תהליכי רקע](05-integrations/background-jobs.md), [מחזור חיי מסמך](05-integrations/document-lifecycle.md) |
| AI | [המצב הקיים בשני המקורות](06-ai/current-ai-architecture.md), [שיחה וכלים](06-ai/chat-and-tools.md), [מפת פיתוח AI Chat](06-ai/development-ai-chat.md), [Document AI](06-ai/document-ai.md), [אפשרויות הרחבה](06-ai/ai-extension-points.md) |
| מערכת | [מסלולים בין שכבות](07-system/end-to-end-flows.md), [תרשימים](07-system/architecture-diagrams.md), [מגבלות ולא ידועים](07-system/known-limitations.md) |

## מקורות נתונים הזמינים עקרונית לסיוע AI

| מקור קיים | מה אפשר להבין ממנו | גבול |
|---|---|---|
| `ExtractedDocument` וקובץ מקור ב־Drive | תוכן מסמך, חילוץ, מקור ומצב בדיקה | מידע רגיש; הצעת חילוץ אינה אמת חשבונאית מאושרת |
| `SlimTransaction` ו־`FullTransactionCache` | תנועות, סיווג, מקור בנקאי ומצב התאמה | cache עשוי להתנקות; הוא אינו ספר הוצאות |
| `Expense` ו־snapshots | הוצאה, דין חשבונאי במועד האישור וראיות מקור | תקופות מדווחות והפרדת אישור רו״ח |
| `JournalEntry` ו־`JournalLine` | רישומים וסכומי דוחות | סינון לפי משתמש ועסק; אין גישה כללית לכל חשבונות המייצג |
| `Documents`, שורות ותשלומים | מסמכים שהעסק הפיק והקשרים העסקיים | נפרד ממסמכי ספקים ומנתוני מנוי הפלטפורמה |
| קטלוג ומשימות דיווח | סיווג מותר, מיפויים, השלמות נדרשות | שכבות בעלות; סטטוס דיווח אינו אישור חיצוני |
| `AnnualReport` וקבצים | שאלון וחומר להכנת דוח שנתי | מסלול חלקי; אין חיבור אוטומטי מלא לתיוק OCR |

הטבלה מציינת נתונים קיימים בקוד, **לא חיבור של כולם למודל**. ב־MAIN הקשר המודל המאומת הוא הקובץ והקטלוג. ב־AI-DEV כלי הצ׳אט קוראים projections מוגבלים של הוצאות, slim/cache וקטלוג; נשלחים גם הקשר שיחה, סיכום וראיות קריאה. אין reader מחובר ליומן, למסמכי מקור או לדוח שנתי. ראו [מפת פיתוח AI Chat](06-ai/development-ai-chat.md).

## שיטת העבודה ואימות התוצר

המחקר פוצל לסוכני frontend, backend/data ו־integrations/AI, וסוכם עם בדיקת תהליכי מוצר וסקירה רוחבית. נקראו הוראות הפרויקט והתוכנית החשבונאית; טענות מרכזיות נבדקו מול routes, guards, services וישויות. שמות קבצי מקור נכתבים כנתיבים יחסיים לשורש המאגר. מצב ״מומש״ מתייחס למסלול קוד, ״חלקי״ למסלול שאינו מכסה את כל היכולת, ״מתוכנן״ לכוונה מתועדת ו״לא אומת״ לראיות חסרות.

המפה כוללת כעת **24 קובצי Markdown** רק תחת `app-mapping/`. מפת MAIN נשמרה ונוספו הבחנות ומקורות ל־AI-DEV. בדיקת הפיתוח הייתה read-only; 63 קובצי מקור הושוו ל־commit הנקוב ללא הבדלי תוכן לאחר נרמול סיומות שורה. לא נטען שכל ה־worktree נקי. נבדקו קישורי ניווט ו־whitespace; לא נמצא checker ייעודי ולכן בוצעה בדיקה מקומית. לא הורצו היישום, tests או builds; לא בוצעו commits, push, החלפת branches, merge/cherry-pick, שינויי worktree/סכמה או קריאות למסד נתונים ולספק.

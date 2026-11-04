# מודל הנתונים

## בסיס וטווח הוודאות

**ממומש:** MySQL באמצעות TypeORM, עם רישום ישויות מפורש ב־`backend/src/app.module.ts`. המפה מתארת metadata וקוד שאילתות, לא introspection של מסד חי. שמות ישויות וקשרים לוגיים אינם בהכרח FK פיזי; יש להבחין ביניהם. לא נקראו dump, נתוני לקוחות או קובצי סביבה.

## ארבע שכבות נתונים

| שכבה | הנתונים המרכזיים | גבול הבעלות והשימוש |
|---|---|---|
| זהות וארגון | `User`, `Child`, `Business`, `Delegation` | Firebase UID מחבר בעלים לעסק; Delegation הוא קשר הרשאה, לא העברת בעלות |
| מקור וטיוטה | `Source`, `Bill`, `SlimTransaction`, `FullTransactionCache`, `ExtractedDocument`, `ImportedDocument` | חומר בנקאי/מסמכי, מצב התאמה/סנכרון והצעות סיווג; אינו כולו ספר חשבונאי מאושר |
| החלטה וספרים | `Expense`, `Documents`, `JournalEntry`, `JournalLine`, קטלוג וכרטיסים | אישור, snapshots, מספור ותקופות דיווח; דוחות חשבונאיים קוראים יומן |
| תהליך ותפעול | `ReportWorkflow`, `AccountantTask`, `AnnualReport`, billing, OAuth ואירועי ספק | סטטוסים וחובות תפעוליים; יש להבדיל חיוב הפלטפורמה מספרי העסק |

## בעלות פיננסית

`Business.firebaseId` קובע בעלים, ו־`businessNumber` הוא מזהה עסק עם אינדקס unique nullable. בכמה טבלאות הבעלות נשמרת שוב כ־`userId`/`firebaseId` יחד עם `businessNumber`/`issuerBusinessNumber`. המודל אינו tenant-table יחיד עם FK לכל רשומה; רבות מהאסוציאציות הן מחרוזות ובדיקות שירות. אין להציג את כל הנתונים של אותו businessNumber ללא הקשר המשתמש המאומת.

`User.index` הוא PK פנימי; `User.id` הוא שדה זהות אישי ואינו אותו מפתח. Firebase UID מופיע בנפרד. `Clients` הוא ספר לקוחות העסק; לקוחות מייצג נובעים מ־`Delegation`. מקורות: `backend/src/users/user.entity.ts`, `backend/src/business/business.entity.ts`, `backend/src/delegation/delegation.entity.ts`, `backend/src/clients/clients.entity.ts`.

## הקטלוג החשבונאי — ממומש

`Category` היא קבוצת תצוגה; `SubCategory` היא שם ללקוח שמצביע על `BookingAccount`; הכרטיס נושא חוקי מע״מ/מס, הכרה, ציוד ופחת, ומשויך ל־`AccountingSection`. לקוח יכול לקבל overrides מול קטלוג המייצג והמערכת. קוד חשבון הוא string וייחודי בתוך `chartOwnerKey`, לא גלובלית.

הוצאה שומרת `subCategoryId` ו־snapshots של חתך, חשבון, 6111, אחוזים, ציוד ופחת, יחד עם `description`, מצב אישור, מבצע וזמני אישור/override. שינוי הקטלוג לעתיד אינו היתר לכתוב מחדש היסטוריה. `classificationOverrideByUserId` מונע פתרון אוטומטי חוזר; תקופה מדווחת חוסמת שינוי סיווג. מסמכים שנתיים שנשלחים לתיוק אינם הופכים אוטומטית להוצאה או לפקודת יומן.

מקורות: `backend/src/bookkeeping/{category,sub-category,account,accounting-section}.entity.ts`, `backend/src/expenses/expenses.entity.ts`, `backend/src/expenses/expenses.service.ts`, `backend/src/documents/extracted-document.entity.ts`, `docs/redesign/categories-redesign-master-plan.md`.

## תנועות, מסמכים ודיווח

slim שומר את המצב המתמשך החשוב לסיווג ונעילה; full cache הוא מודל קריאה מפורט שניתן לניקוי/שחזור. שניהם ייחודיים על `(userId, externalTransactionId)`. `ClassifiedTransactions` מכיל כללי סיווג, לא תנועות יומן. הוצאה יכולה להצביע הן ל־`externalTransactionId` והן ל־`sourceDocumentId`, ולכן התאמה בין מסמך לתנועה אינה אמורה ליצור שתי הוצאות.

מסמך מופק מחולק ל־`Documents`, `DocLines`, `DocPayments`; מספור מנוהל ב־`SettingDocuments` והייחוד הוא עסק+סוג+מספר. `ExtractedDocument` מתאר מסמך שנקלט ונותח, עם אפשרות ליותר מחלק אחד של קובץ דרך `(driveFileId, subIndex)`. קישור ביניהם או ליומן חייב להתפרש לפי התהליך; אלו אינם שני שמות לאותה ישות.

מקורות: `backend/src/transactions/slim-transaction.entity.ts`, `backend/src/transactions/full-transaction-cache.entity.ts`, `backend/src/documents/documents.entity.ts`, `backend/src/documents/settingDocuments.entity.ts`, `backend/src/documents/extracted-document.entity.ts`.

## סכימה ו־legacy

אין ב־AppModule migration runner מוגדר. שינויי סכימה/נתונים מתועדים ב־`docs/redesign/cutover.sql` וב־`backend/scripts/migrations/`; יש סקריפטים ידניים ייעודיים ולא רק מסמך היסטורי אחד. `synchronize` תלוי flags, ו־start:watch משביתו כברירת מחדל. seeder הקטלוג יוצר חסרים בלבד ומכבד `SKIP_BOOT_SEED`.

**חלקי/legacy:** ארבע טבלאות הקטלוג הישנות ו־`Transactions` עדיין רשומות; מחרוזות `Expense.category/subCategory`, `pnlCategory` ושדות תצוגה ישנים נשארו. חלק מהערות הישויות מתארות שלבי פיתוח שכבר עברו. Phase 7 במאסטר־פלן עדיין מסומן כמתוכנן; מצב cutover ב־AGENTS אינו ראיה מספקת לסכימה בפועל כיום.

**לא אומת:** התאמה בין כל entity לסכימה חיה, מצב החלת כל SQL, גודל טבלאות, איכות backfills, גיבויים ושחזור. אין להוציא מן המפה הבטחת FK או uniqueness שאינם מופיעים בקוד/SQL שצוין.

## AI-DEV — נתוני שיחה זמניים

מקור: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. `AiChatSessionEntity` מוסיף במודל הפיתוח טבלת `ai_chat_session`: handle digest ייחודי, קישורי actor/subject, access mode, expiry/heartbeat, contextVersion ו־JSON מוגבל לשיחה. ה־JSON כולל transcript, summary, הקשר עסק/תקופות/משימה, הבהרה ופעולות קריאה; אינו ספר פיננסי או vector store. השרת אוכף בעלות ותוקף ו־CAS; זו כתיבת state נפרדת מהקריאה בלבד של כלי הנתונים העסקיים.

מקורות AI-DEV: `backend/src/ai-chat/session-store/conversation-session.entity.ts`, `conversation-session.repository.ts`, `conversation-session.config.ts` באותה תיקייה ו־`backend/src/app.module.ts`. לא אומתה החלת הטבלה במסד חי. [פירוט session וזיכרון](../06-ai/development-ai-chat.md). מפת הישויות הקודמת ממשיכה לתאר MAIN.

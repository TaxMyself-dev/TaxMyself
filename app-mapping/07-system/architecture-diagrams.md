# תרשימי ארכיטקטורה

התרשימים מתארים גבולות לוגיים בקוד; הם אינם תרשים פריסה מאומת של production.

## תמונת מערכת ב־MAIN

```mermaid
flowchart TB
  Owner["בעל עסק / רואה חשבון / מנהל"] --> UI["Angular 19 + Ionic + PrimeNG"]
  UI --> Auth["Firebase Auth"]
  UI --> API["NestJS API"]
  API --> Guard["FirebaseAuthGuard + delegation + module gates"]
  Guard --> Domain["Documents / Expenses / Transactions / Reports"]
  Domain --> ORM["TypeORM"]
  ORM --> DB[("MySQL משותף, גבולות לפי משתמש ועסק")]
  Domain --> Drive["Google Drive - קבצי מקור"]
  Domain --> Storage["Firebase Storage - קבצים מופקים"]
  Domain --> AI["Anthropic Claude - חילוץ וסיווג"]
  Domain --> PDF["PDF renderer / pdf-service + FillFaster"]
  API --> Banking["Feezback"]
  API --> Mail["Gmail / Mailgun / Brevo"]
  API --> Pay["CardCom"]
  API --> Tax["SHAAM - מוצרים וסביבות נפרדים"]
```

מקורות: `backend/src/app.module.ts`, `frontend/package.json`, תיקיות `backend/src/documents/`, `backend/src/integrations/`, `backend/src/shaam/`.

## קליטה ואישור

```mermaid
flowchart LR
  Sources["העלאה / Gmail / דואר נכנס"] --> Drive["Drive inbox"]
  Drive --> OCR["Claude extract"]
  OCR --> Extracted["ExtractedDocument"]
  Bank["Feezback"] --> Tx["SlimTransaction + cache"]
  Extracted --> Review["בדיקה והתאמה"]
  Tx --> Review
  Review --> Decision{"החלטת משתמש מוסמך"}
  Decision -->|"הוצאה עם מיפוי"| Expense["Expense + snapshot"]
  Expense --> Journal["JournalEntry + JournalLine"]
  Decision -->|"חומר שנתי"| Filed["NOT_AN_EXPENSE; ללא יומן"]
  Decision -->|"חסר מידע"| Pending["המתנה / השלמת מיפוי"]
  Journal --> Reports["מע״מ / רווח והפסד / כרטסת"]
```

הוצאה ויומן נשמרים יחד במסלולי האישור; החצים אינם מציינים שכל קליטת המקור מתבצעת באותה טרנזקציה. מקורות: `backend/src/reports/report-review.service.ts`, `backend/src/expenses/expenses.service.ts`.

## כללי סיווג לעומת היסטוריה חשבונאית

```mermaid
flowchart TB
  Layers["CLIENT מעל ACCOUNTANT מעל SYSTEM"] --> Cat["Category"]
  Cat --> Sub["SubCategory - שפת המשתמש"]
  Sub --> Account["BookingAccount - כללי מס והכרה"]
  Account --> Section["AccountingSection - חתך דיווח"]
  Account --> Snap["snapshot בעת אישור הוצאה"]
  Snap --> Journal["רישום ביומן"]
  Journal --> History["דוחות ותיעוד היסטורי"]
  Sub --> Private["isPrivate: ללא כרטיס וללא יומן"]
```

שינוי מיפוי לעתיד אינו בקשה לשכתב הוצאות קודמות. תווית וחתך בדוח עדיין עשויים להיקרא מקטלוג כרטיסים נוכחי; יש להבחין בינם לבין הסכומים שנרשמו. מקורות: `backend/src/bookkeeping/catalog.service.ts`, `backend/src/expenses/expenses.service.ts`, `backend/src/reports/reports.service.ts`.

## תוספת AI-DEV — הצ׳אט בפיתוח

התרשימים הקודמים משמרים את MAIN. התרשים הבא מתאר קוד ב־worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`; אינו חלק מ־MAIN שנבדק ואינו טענת פריסה.

```mermaid
flowchart TB
  UI["AiChatComponent - מעטפת Angular, AI-DEV"] --> API["AiChatController /ai-chat"]
  API --> Auth["FirebaseAuthGuard ואז AiChatAccessGuard"]
  Auth --> Turn["ConversationTurnService - בעלות, CAS, replay"]
  Turn <--> Session[("ai_chat_session - transcript, context, summary")]
  Turn --> Loop["AiChatService - analyze, resolve, read, deliver, review"]
  Loop <--> Gateway["ChatModelGateway + Anthropic adapter"]
  Gateway <--> Model["מודל שרת; default Haiku 4.5; כבוי ללא תצורה"]
  Loop --> Scope["ChatBusinessScopeService - עסק מורשה"]
  Loop --> Registry["ChatReadToolRegistry"]
  Registry --> Spending["summary / breakdown / items"]
  Registry --> Catalog["expense catalog"]
  Spending --> Data[("Expense + slim + full cache - קריאה בלבד")]
  Catalog --> Existing["CatalogContextService + CatalogService"]
  Loop -. "reader לא מחובר" .-> Partial["ACCOUNTING_VIEW / CASHFLOW_VIEW - partial"]
```

השיחה קוראת נתונים עסקיים וכותבת state רק בטבלת session; אין כלי אישור הוצאה או כתיבה ליומן. context רגיל מורשה לפי בעלות/ייצוג; client-view רגיל חסום ואילו admin client-view מוגבל לעסקי הלקוח הנצפה. מקור AI-DEV: `backend/src/ai-chat/`, `frontend/src/app/components/ai-chat/`, `frontend/src/app/services/ai-chat.service.ts`. פירוט: [מפת פיתוח AI Chat](../06-ai/development-ai-chat.md).

# AI Chat — מימוש ב־worktree פיתוח

## מקור וסטטוס

כל היכולות בפרק זה מקורן ב־**AI-DEV**: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit **`8c30a975142816ffafcb99f672786223d1044b92`**. הן אינן חלק ממפת `main` ב־`0a74039bb98c8f4ad94da7565dcc659bc3399aa4`. נתיבי המקור להלן יחסיים לשורש AI-DEV. המקור אותר באמצעות `git worktree list --porcelain`; 63 קובצי המקור שנבדקו הושוו לתוכן ה־commit ולא נמצאו הבדלים לאחר נרמול סיומות שורה. אין בכך טענה שכל ה־worktree נקי או שהפיצ׳ר פרוס.

**מומש ב־worktree** = מסלול קוד מחובר. **חלקי** = חוזה או מסלול שלא מחובר לכל מקורותיו. **מתוכנן / לא אומת** = אינו יכולת פעילה שהוכחה בסריקה. לא הורצו tests, builds, שאילתות DB או קריאות למודל.

## ארכיטקטורה ו־orchestration

`AppModule` מייבא `AiChatModule` ורושם `AiChatSessionEntity`. זהו מודול בתוך שרת NestJS, עם מעטפת מודל נפרדת מ־OCR. `AiChatController` חושף `POST /ai-chat/turn`, `GET /ai-chat/session`, `POST /ai-chat/session/heartbeat` ו־`DELETE /ai-chat/session`; תשובות מסומנות `no-store`.

`ConversationTurnService` טוען session, תובע תור באמצעות compare-and-swap, מטפל ב־requestId חוזר ומעביר ל־`AiChatService` היסטוריה שנבנתה בשרת. ה־DTO של הדפדפן כולל history, אך הוא אינו מקור הזיכרון הסמכותי במסלול זה.

רצף רגיל:

1. קריאת `analyze_turn` מחויבת מפיקה הבנה מובנית של כוונה, אוכלוסייה, מידע נדרש, תקופות, פעולות והמשך שיחה.
2. השרת ממזג רק מאפייני משימה שלא השתנו עם `activeTask`, פותר ישות עסק מורשית ומבקש הבהרה אם צריך.
3. המודל בוחר מתוך כלים מורשים; השרת מאמת schema, טווחי תאריכים והרשאה מחדש לפני קריאה.
4. נצברות ראיות טריות עם הבחנה בין AVAILABLE, EMPTY ו־UNKNOWN. `finish_reads` בודק כיסוי; יש תיקון מוגבל של ארגומנטים וכיסוי.
5. `deliver_answer` מחזיר טקסט עברי וחוזה תשובה. בתשובה פיננסית במסלול החוזה החדש מתבצעת גם קריאת `review_answer` עצמאית. השוואות scalar תואמות יכולות לקבל ניסוח וחישוב דטרמיניסטיים ב־`chat-scalar-comparison.ts`.
6. נשמרים תשובה, הקשר, זיכרון פעולות וסיכום מתגלגל לפי הצורך. שגיאה מתורגמת לקוד ציבורי יציב; אין חשיפת שגיאת ספק גולמית למשתמש.

הלולאה מוגבלת לעשרה צעדים ועד ארבע קריאות נתונים. קריאות ניתוח, סקירה וסיכום הן שלבים נוספים; אין לפרש עשרה צעדים כתקרת עשר קריאות ספק לכל HTTP request. תקציב תור ברירת מחדל הוא 240 שניות, בנפרד מ־timeout לקריאת מודל ומחיי session. heartbeat אינו מאריך את תקציב התור. עבודת DB שכבר יצאה אינה ניתנת לביטול; תור PENDING ישן ניתן להשבה בבקשה מאוחרת באמצעות CAS.

מקורות: `backend/src/ai-chat/ai-chat.module.ts`, `ai-chat.controller.ts`, `ai-chat.service.ts`, `chat-turn-analysis.ts`, `chat-completion-checks.ts`, `chat-evidence.ts`, `chat-request-context.ts`, `chat-scalar-comparison.ts`, ו־`session-store/conversation-turn.service.ts`, יחסיים ל־`backend/src/ai-chat/` אחרי הקובץ הראשון.

## registry וכלים עסקיים מחוברים

`ChatReadToolRegistry` מפרסם רק הגדרות רשומות, דוחה שמות כפולים ומנתב `execute`. הכלים מספקים capabilities, facts ו־limitations. אין כלי SQL חופשי או כלי כתיבה פיננסית.

| כלי ב־AI-DEV | יכולת שמומשה | גבולות |
|---|---|---|
| `query_spending_summary` | סכום, כמות וקיום הוצאות לפי עסק ותקופה; חיפוש קטגוריה/תת־קטגוריה/ספק; תנועות לא מסווגות בנפרד | קריאה אחת לעסק ותקופה; השוואה מורכבת מכמה קריאות |
| `query_spending_breakdown` | דירוג לפי קטגוריה, תת־קטגוריה או counterparty; פירוט מאושר מול ממתין | עד 10 קבוצות, סימון truncation; קשר הורה נלקח מ־FK, אינו ניחוש |
| `query_spending_items` | חקירת רשומות הוצאה/תנועה מצומצמות | עד 20 פריטים, כמות כוללת ו־truncation; ללא קבצים, הערות או שורות גולמיות |
| `query_expense_catalog` | חיפוש בקטלוג ההוצאות הממוזג הקיים | עד 5 רמזים ו־30 תוצאות; קטלוג נוכחי אינו ראיית הוצאה או דין היסטורי |

כלי פרוטוקול נוספים: `find_entities`, `select_entity`, `select_data_view`, `answer_from_context`, `refuse_request`, `respond_without_data`, וכלי ניתוח/סיום/סקירה. אלה כלי תזמור, לא endpoints פיננסיים עצמאיים. resolver כללי מחובר כרגע רק ל־BUSINESS; הכרת טיפוס SUPPLIER/CATEGORY/DOCUMENT וכדומה אינה resolver ממומש. חיפוש קטלוג נעשה בכלי ייעודי גם בלי resolver כללי לקטגוריה.

מקורות: `backend/src/ai-chat/tools/`, `backend/src/ai-chat/ai-chat.service.ts`, `backend/src/ai-chat/chat-entity-resolution.service.ts`, `backend/src/ai-chat/chat-catalog-query.service.ts`.

## משמעות הנתונים וחיבור לליבה

`SPENDING_VIEW` מחבר סכומי `Expense` מאושרות עם תנועות יוצאות ב־full cache שיש להן רשומת slim ושאינן מיוצגות כבר בהוצאה מאושרת לפי externalTransactionId. התוצאה מפרידה approved מול classified-pending; תנועות cache ללא slim מוצגות כסכום/כמות מוחרגים. זהו חישוב הוצאה לצורכי שיחה, **לא** דוח רווח והפסד מהיומן או סכום הוצאה מוכרת למס.

השאילתות קבועות ופרמטריות ב־`ChatSpendingQueryService`; אינן מריצות SQL שהמודל חיבר. הן משתמשות ב־ownerFirebaseId וב־businessNumber שנפתרו בשרת. הקריאות תלויות בזמינות cache; אין להסיק שזיכרון השיחה משמר תמונת בנק היסטורית. טווח קריאה בודדת מוגבל ל־366 ימים; ניתוח יכול להכיל עד ארבע תקופות והשוואה רחבה יותר בכפוף לתקציב הקריאות.

קטלוג מחובר דרך `CatalogContextService.forUser` ו־`CatalogService.getMergedExpenseCatalog` מתוך `BookkeepingModule`. `ACCOUNTING_VIEW` ו־`CASHFLOW_VIEW` מוכרים ברמת חוזה וכוונה, אך אינם readers מחוברים לדוחות/יומן/תזרים מלא: המסלול מחזיר `CAPABILITY_NOT_AVAILABLE` ו־partial במקום נתונים בדויים. עם זאת, סיכומי תנועות לא מסווגות זמינים דרך כלי ההוצאות המצומצם.

מקורות: `backend/src/ai-chat/chat-spending-query.service.ts`, `backend/src/ai-chat/chat-catalog-query.service.ts`, `backend/src/ai-chat/ai-chat.service.ts`.

## מודלים וספק

`ChatModelGateway` מגדיר חוזה provider-neutral של messages, tool-use ו־tool-results. factory מפעיל Anthropic רק לפי תצורת שרת ומפתח זמין; ברירת המחדל ללא בחירה תקפה היא provider מושבת. fake provider מותר רק מחוץ ל־production. שם מודל, ספק, timeout ותקציב tokens אינם נבחרים בידי הדפדפן.

ברירת המחדל המוגדרת ל־Anthropic היא `claude-haiku-4-5`, עם אפשרות `AI_CHAT_MODEL`; timeout ברירת מחדל 15 שניות ו־maxTokens של 1,024 לקריאה. אלו defaults בקוד, לא תצורה חיה שנבדקה. ה־adapter מכבה SDK retries וכלים מקבילים כשכלים זמינים, ומבצע strict schema projection בקריאות REQUIRED בעלות כלי יחיד. אין fallback מודל אוטומטי מאומת. OCR ב־main נשאר מסלול נפרד עם `claude-sonnet-4-6`.

מקורות: `backend/src/ai-chat/chat-model.gateway.ts`, `backend/src/ai-chat/providers/chat-model-provider.factory.ts`, `backend/src/ai-chat/providers/anthropic-chat-model.provider.ts`, `backend/src/ai-chat/providers/anthropic-tool-schema.ts`.

## sessions וזיכרון

`ai_chat_session` מחזיק JSON מוגבל: transcript לתצוגה, turns שהושלמו, active business/period/data view/task, תקופות השוואה, rolling summary, הבהרה ממתינה, עד 20 פעולות קריאה אחרונות והצעת פעולה אחת. פעולות שמורות כוללות ארגומנטים והקשר; אין בהן עותק ראיות פיננסיות שמותר להסתמך עליו כתוצאה טרייה. transcript עצמו עשוי לכלול תשובות כספיות ולכן הוא מידע רגיש.

cookie אטום `keepintax_ai_chat` הוא HttpOnly ובנתיב `/ai-chat`. DB שומר digest של handle וקישורי זהות actor/subject/accessMode; epoch כולל scopes. SELF, DELEGATED ו־ADMIN_IMPERSONATION הם מצבי קישור נתמכים בנתונים, גם כאשר guard חוסם כניסה מסוימת. בדיקות בעלות ותוקף ו־contextVersion מגינות על load/update. ברירת מחדל: lease מתחדש של שעה, state עד 256 KiB ו־100 הודעות transcript. זהו זיכרון זמני, לא מאגר שיחות ארוך טווח או vector store.

הקשר למודל נבנה מ־turns שהושלמו: יעד 12 turns, buffer של 16 ותקציב שמרני של כ־12,000 tokens להיסטוריה. סיכום מצמצם היסטוריה ישנה; אינו ראיה פיננסית. בקשת requestId שכבר הושלמה יכולה להחזיר תשובה שמורה במסגרת ה־session, בעוד קריאת נתונים חדשה נדרשת לחישוב חדש.

מקורות: `backend/src/ai-chat/session-store/`, ובפרט `conversation-session.entity.ts`, `conversation-session.repository.ts`, `conversation-session.config.ts`, `conversation-session-owner.ts`, `conversation-turn.service.ts`, `conversation-model-context.ts`, `conversation-summary.service.ts`.

## אימות והרשאת עסק

כל routes הצ׳אט משתמשים ב־`FirebaseAuthGuard` ואחריו `AiChatAccessGuard`, ו־POST מסומן במפורש `DOCUMENTS_READ`. ה־guard הנוסף דוחה `isDelegatedAccess` שאינו admin impersonation לפני עבודת session/model. לפיכך אין להציג כניסה רגילה של רו״ח להקשר לקוח כיכולת פתוחה.

בהקשר עצמי, `ChatBusinessScopeService` מאפשר עסקים בבעלות השחקן וכן בעלי ACTIVE delegations שלו. כלומר רו״ח בהקשר עצמי יכול לשאול על עסק מורשה, אף שהפעלת הצ׳אט ב־client-view רגיל חסומה. ב־admin impersonation הסט מוגבל לעסקים בבעלות הלקוח הנצפה בלבד; עסקי ה־admin וייצוגי הלקוח אינם מרחיבים אותו. references נבדקים מחדש בבחירה ובקריאה; browser-selected business אינו סמכות.

לא נמצא `SubscriptionGuard` על controller הצ׳אט שנבדק; אין להניח שזכאות chat נובעת אוטומטית משומרי המודולים הקיימים. CORS credentials מוגדרים למסלול chat בלבד; אימות תצורה חיה, cookies ומדיניות גישה כוללת לא בוצע.

מקורות: `backend/src/ai-chat/ai-chat.controller.ts`, `backend/src/ai-chat/ai-chat-access.guard.ts`, `backend/src/ai-chat/chat-business-scope.service.ts`, `backend/src/ai-chat/tools/`, `backend/src/main.ts`.

## Frontend וחוויית שיחה

הרכיב `AiChatComponent` נטען במעטפת האפליקציה לאחר התייצבות Firebase וניווט למסך מאומת; אינו route עצמאי ואינו מוצג במסכי כניסה/callback. זהו panel משמאל בדסקטופ ו־sheet בנייד, בעברית, עם שאלות לדוגמה, שליחה, בחירת הבהרה, סימון תשובה חלקית ומקורות. הטקסט מוצג באינטרפולציה, ללא HTML מהמודל.

פתיחה משחזרת session מהשרת; רענון יכול להחזיר transcript והבהרה. מזעור שומר שיחה; X מבקש מחיקה בשרת ומנקה UI רק לאחר אישור. heartbeat פועל בעת שהרכיב mounted ונעצר בהחלפת זהות/פירוק. בחירת עסק בצ׳אט עצמאית מבחירת העסק במסכים. ב־client-view הרכיב mounted רק עבור ADMIN אמיתי; שינוי לקוח משנה contextKey. `AiChatService` משתמש ב־HttpClient וב־withCredentials, ומסתמך על interceptors קיימים לאימות.

מקורות: `frontend/src/app/components/ai-chat/ai-chat.component.ts`, `ai-chat.component.html`, `ai-chat.component.scss` באותה תיקייה; `frontend/src/app/services/ai-chat.service.ts`, `frontend/src/app/app.component.ts`, `frontend/src/app/app.component.html`.

## מגבלות ומוכנות

- **מומש ב־AI-DEV:** שיחה, כלי קריאה מוגבלים, חיבור Anthropic, session זמני, זיכרון משימה, חיפוש עסק מורשה, UI והגנות שגיאה.
- **חלקי:** הסבר כספי בהיקף readers קיימים; accounting/cashflow מלאים ו־resolvers נוספים אינם מחוברים. אין הפקה/אישור/עריכת הוצאה או שליחת דוח באמצעות הצ׳אט. ״קריאה בלבד״ מתייחס לנתונים עסקיים; ניהול session כן כותב לטבלת הצ׳אט.
- **לא נמצא:** RAG, embeddings, vector DB או גישה של הצ׳אט לקבצים כראיות באמצעות כלי מסמך. הרחבות כאלה אינן נובעות מעצם קיום registry.
- **מומש אך לא הוערך כאן:** telemetry עם allow-list; debug traces מלאים הם opt-in מקומי ומושבתים ב־production. traces ותוכן session דורשים טיפול כמידע רגיש.
- **לא אומת:** הפעלת provider, יצירת הטבלה בסביבה חיה, איכות עברית/השוואות/המשך שיחה, latency, עלות והפעלת production. קיימים fixtures, סקריפטי verification ו־reliability evaluation; הם לא הורצו במשימה זו, ואין כאן אישור שה־acceptance gates עברו.

מקורות נוספים: `backend/src/ai-chat/chat-telemetry.ts`, `backend/src/ai-chat/chat-debug-trace.ts`, `backend/test/ai-chat/reliability.md`, `backend/scripts/evaluate-ai-chat-conversations.ts`, `docs/plans/new-ai-chat.md`, `docs/tasks/active/KT-031-new-ai-chat.md`.

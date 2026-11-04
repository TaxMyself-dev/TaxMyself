# שיחה, כלים, הקשר וזיכרון

## מצב MAIN

בסריקת MAIN לא נמצא ממשק שיחת AI או endpoint שיחה. הממצא מוגבל ל־`main` ב־`0a74039bb98c8f4ad94da7565dcc659bc3399aa4`; תשתית צ׳אט קיימת ב־worktree הפיתוח המתואר להלן.

קריאת Anthropic היא בקשת חילוץ יחידה עם הודעת user אחת וקובץ מצורף. אין history, assistant turns או רשימת tools בבקשה. מקור: `backend/src/documents/document-processor.service.ts`.

## מנגנוני MAIN שאין לבלבל עם כלי AI

| מנגנון | משמעות בפועל |
|---|---|
| services ו־controllers של Nest | API ולוגיקה עסקית שנקראים מהיישום; אינם כלים שנמסרים למודל |
| `ClassifiedTransactions` | כללי סיווג סוחר עם תנאים וניקוד דטרמיניסטי; אין למידה משיחה |
| `CatalogContextService` | הקשר בעלות/עסק/רו״ח לבחירת קטלוג; אינו conversational context |
| `rawResponse` | ראיית חילוץ לצורך שמירה/אבחון; אינו היסטוריית שיחה |
| prompt cache | reuse של prefix הוראות וקטלוג אצל הספק; אינו זיכרון עסקי |
| מצבי sync ו־webhook audit | מצבי אינטגרציה ותפעול; אינם task memory של agent |

מקורות: `backend/src/transactions/classified-transactions.entity.ts`, `backend/src/transactions/transaction-processing.service.ts`, `backend/src/bookkeeping/catalog-context.service.ts`, `backend/src/documents/extracted-document.entity.ts`, `backend/src/integrations/entities/user-integration.entity.ts`.

## מימוש AI-DEV — טרם מוזג

מקור כל היכולות בסעיף: `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92` (**AI-DEV**).

**מומש ב־worktree:** `AiChatService` מתזמר ניתוח מובנה, בחירת עסק מורשה, כלי קריאה, בדיקת ראיות, ניסוח וסקירת תשובה. `ChatReadToolRegistry` מחבר `query_spending_summary`, `query_spending_breakdown`, `query_spending_items`, `query_expense_catalog`. Anthropic adapter מתרגם חוזה tools ניטרלי; המודל אינו מקבל SQL חופשי או כלי אישור/שינוי כספים.

זיכרון השרת כולל transcript זמני, סיכום, active task, עסק ותקופות, הבהרות ופעולות קריאה אחרונות. הוא נשמר ב־`ai_chat_session` ומקושר לזהות באמצעות cookie אטום ו־digests. היסטוריית הדפדפן אינה הסמכות; תוצאות חדשות דורשות ראיות קריאה. זהו זיכרון זמני, לא RAG.

**חלקי:** BUSINESS הוא resolver מחובר; טיפוסים אחרים מוכרים אך אינם resolvers פעילים. `ACCOUNTING_VIEW` ו־`CASHFLOW_VIEW` מחזירים מגבלת יכולת ולא דוחות. **לא אומת:** תצורה חיה, פריסה ואיכות. אין כלי כתיבה פיננסית ברשימה שנבדקה. פירוט ותיקי מקור ב־[מפת פיתוח AI Chat](development-ai-chat.md).

מקורות AI-DEV: `backend/src/ai-chat/ai-chat.service.ts`, `backend/src/ai-chat/tools/chat-read-tool.ts`, `backend/src/ai-chat/session-store/conversation-turn.service.ts`, `backend/src/ai-chat/chat-entity-resolution.service.ts`.

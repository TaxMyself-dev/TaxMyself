# ארכיטקטורת AI קיימת

**MAIN:** חילוץ וסיווג מסמך ב־`DocumentProcessorService`, עם Anthropic, SDK `@anthropic-ai/sdk` ומודל קבוע `claude-sonnet-4-6`. זהו ממצא מ־main, לא טענה שאין פיצ׳רי AI בענפי פיתוח.

**AI-DEV — מומש ב־worktree נפרד:** `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. יש `AiChatModule`, לולאת כלים, ארבעה readers עסקיים, Anthropic adapter, session store וזיכרון שיחה וממשק עברי. ברירת מחדל Anthropic בקוד הצ׳אט היא `claude-haiku-4-5`, ניתנת לשינוי בשרת; אין אימות שהספק מופעל בפועל. ראו [מפת פיתוח AI Chat](development-ai-chat.md) לארכיטקטורה, כלים, הרשאות ומגבלות. נתיבי מקור AI-DEV: `backend/src/ai-chat/`, `frontend/src/app/components/ai-chat/`, `frontend/src/app/services/ai-chat.service.ts`.

מקורות: `backend/package.json`, `backend/src/documents/document-processor.service.ts`, `backend/src/documents/documents.module.ts`.

## רצף הקריאה ב־MAIN — Document AI

`DocumentsService` → בניית קטלוג הוצאות עסקי → `extract(buffer, mimeType, catalog)` → `client.messages.create` → טקסט תגובה → ניסיון פענוח JSON → שמירת `ExtractedDocument` והמשך בדיקה אנושית.

הבקשה מכילה שני system blocks: הוראות חילוץ סטטיות וקטלוג שממוין לפי שם תת־קטגוריה. על בלוק הקטלוג מוגדר `cache_control: ephemeral`. קיים רישום מספרי של usage ו־cache tokens. זו אופטימיזציית prefix של הספק; היא אינה זיכרון לקוח או שיחה. cache hit בפועל תלוי בגודל וביציבות הבקשה ולא אומת מול הספק.

מפתח הספק נקרא בסביבה בצד השרת ונוצר client באופן עצל. אין העברת מפתח מודל לפרונט שנמצאה במסלול הזה. `max_tokens` מוגדר ל־8192 כדי לתמוך בכמה מסמכים בקובץ.

## גבולות Document AI ב־MAIN

- המודל מציע שדות וסיווג; הוא אינו מנהל הרשאות, מאשר הוצאות, מבצע חיובים או רושם יומן.
- הקשר המודל הוא תוכן הקובץ והקטלוג. לא נשלחים כל היסטוריית החשבון, דוחות המשתמש או מאגר ידע וקטורי במימוש שנמצא.
- בנקאות פתוחה, סינון Gmail, התאמת תנועות, pairing וכללי סיווג לסוחרים הם לוגיקה דטרמיניסטית. הכינוי ״חכם״ אינו מעיד על LLM.
- ב־MAIN לא נמצא שרת שיחה או tool calling. ב־AI-DEV קיימת תשתית שיחה וכלים ייעודית, ללא צורך ב־framework חיצוני של agents. לא נמצאו embeddings, RAG או vector database בשני המקורות.

## חלקי / לא ידוע

במסלול OCR ב־MAIN קיימת סבילות לתגובות JSON, אך אין schema קשיח מובנה בבקשה. לא נמצאה בו שכבת eval ייעודית לאיכות OCR, תקציב עלות ברמת משתמש או fallback למודל אחר. ב־AI-DEV יש זיכרון זמני, schema validation, בדיקות כיסוי ראיות, review של תשובה ו־fixtures/evaluation לצ׳אט; הם אינם שדרוג אוטומטי של מסלול OCR ולא הורצו כאן. זמינות, איכות, עלות ושיעורי שגיאה בייצור לא נמדדו.

אזכורי OpenAI/ChatGPT בשמות ספקים של demo אינם אינטגרציה ל־OpenAI. מקור לדוגמה: `backend/src/demo-data/profiles/couple-open-banking-no-bills.profile.ts`.

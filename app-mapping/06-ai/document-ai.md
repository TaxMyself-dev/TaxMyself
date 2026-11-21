# AI למסמכים

מסמך זה משמר את מימוש OCR ב־MAIN ב־`0a74039bb98c8f4ad94da7565dcc659bc3399aa4`. הצ׳אט הוא מסלול נפרד ב־AI-DEV: worktree `C:/Users/user/Keepintax/TaxMyself-new-ai-chat`, ענף `new-ai-chat`, commit `8c30a975142816ffafcb99f672786223d1044b92`. אין בו כלי קריאת קובץ/מסמך מחובר שנמצא; קיום צ׳אט אינו משנה את מגבלות ה־OCR המתוארות להלן. ראו [מפת הפיתוח](development-ai-chat.md).

## קלט ופלט מאומתים

`DocumentProcessorService` תומך ב־PDF ובתמונות JPEG/PNG/GIF/WebP. התוכן נשלח כ־base64 לספק, יחד עם prompt באנגלית המטפל בעברית ובאנגלית. הפלט הרצוי הוא `{ invoices: [...] }`, לרבות כמה חשבוניות באותו קובץ.

שדות החילוץ כוללים סוג מסמך, ספק ומזהה מס של המוכר, תאריך, מספר חשבונית ומספר הקצאה, סכום/מע״מ/סכום לפני מע״מ, מטבע, תיאור והצעת קטגוריה/תת־קטגוריה. ההוראות מבחינות בין חשבונית, קבלה, מסמך משולב, זיכוי, טופס 106, טופס מס, חוזה ובלתי מזוהה.

מקור מרכזי: `backend/src/documents/document-processor.service.ts`.

## הקשר סיווג

הקטלוג נבנה ב־`DocumentsService.buildExtractionCatalog` דרך `CatalogService.getMergedExpenseCatalog` והקשר delegation-aware. לכן נכללות שכבות SYSTEM/ACCOUNTANT/CLIENT לפי כללי המיזוג, ולא רק קטלוג ברירת מחדל. המודל מתבקש לבחור שם מדויק או להשאיר סיווג ריק; אין הרשאה להמציא קטגוריות. מזהי תת־קטגוריות משמשים לחיבור חוזר בשרת אך אינם חלק מטקסט הקטלוג שנשלח למודל.

מקורות: `backend/src/documents/documents.service.ts`, `backend/src/bookkeeping/catalog.service.ts`, `backend/src/bookkeeping/catalog-context.service.ts`. הדין החשבונאי והקיבוע באישור מוגדרים בתוכנית `docs/redesign/categories-redesign-master-plan.md`; ערכי המודל אינם עוקפים אותם.

## עיבוד התוצאה

יש גם מסלול חד־פעמי נפרד: `DocumentsService.ocrSingleFile` מחזיר את החשבונית הראשונה ומספר החשבוניות למילוי טופס ידני, בלי לשמור רשומת חילוץ. לעומתו `uploadAndOcrDoc` מעלה ל־Drive ושומר רשומה לכל חשבונית. אין להסיק שקבלת פלט OCR לבדה מבטיחה שהמסמך כבר בארכיון.

- מחברים text blocks ומנסים להסיר Markdown fences/טקסט עוטף. מתקבלים גם מערך חשבוניות ישיר ואובייקט יחיד. כשל פענוח מחזיר `invoices=null`; מערך ריק מציין שלא זוהו חשבוניות.
- זו המרה סובלנית ל־JSON, ללא ולידציית schema מלאה בתוך processor. ההתנהגות downstream אינה הוכחה שכל שדה שחזר מהמודל תקין.
- `DocumentsService` שומר תוצאות עם provenance וסטטוס; סקירת משתמש ותיקון נשארים חלק מהמסלול. `ExtractedDocument` שומר גם raw response.
- זיהוי כפילות תוכן, pairing של חשבונית/קבלה והתאמה לתנועת בנק מבוצעים בקוד. המרת מטבע נעשית ב־`FxRateService`, כשהמודל מתבקש להחזיר את מטבע המקור.

## פערים נצפים

לא נמצא confidence score בפלט המודל, מסלול low-confidence ייעודי, fallback בין מודלים או extraction עם JSON Schema מובנה. קיימים לוגים של שימוש בטוקנים; בשגיאת JSON נרשמים גם קטעי ראש/זנב תגובה, ולכן אין לטעון שהלוגים מכילים רק metadata תפעולי. זהו סיכון חשיפת תוכן מסמך שזוהה בקוד, ולא בדיקת דליפה בפועל.

מקורות משלימים: `backend/src/documents/extracted-document.entity.ts`, `backend/src/documents/document-pairing.service.ts`, `backend/src/reports/matching.service.ts`, `backend/src/shared/fx-rate.service.ts`.

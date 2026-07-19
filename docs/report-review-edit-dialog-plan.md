# תכנון — מעבר מעריכה inline לפופאפ עריכה ב-report-review

תיעוד + תכנון בלבד — נכתב **לפני** מימוש. אין בקובץ הזה שינויי קוד.
כל הממצאים נקראו בפועל מהקוד (לא הונחו משם קבצים). ראו גם
[docs/report-review-audit.md](report-review-audit.md) למיפוי הכללי של העמוד.

## המצב הרצוי (תזכורת)

לחיצה על "הגדר הוצאה"/עריכה תפתח פופאפ/דיאלוג במקום עריכה inline בתוך השורה:

- **matched / doc_only** (יש מסמך מקושר): פופאפ בשני טורים — שדות עריכה בצד
  שמאל, תצוגת המסמך המקושר (Drive) בצד ימין, עם גלילה.
- **tx_only** (תנועת בנק בלבד): פופאפ ברוחב מלא, טור אחד, בלי אזור מסמך.

הלוגיקה של השמירה/אישור לא משתנה — רק מעטפת ה-UI.

---

## 1. באיזו קומפוננטת דיאלוג קיימת מתבססים

נבדקו שתי קומפוננטות "הוספת הוצאה ידנית" קיימות באפליקציה — אף אחת מהן
אינה בסיס טוב:

- **`shared/modal-add-expenses/` (`ModalExpensesComponent`)** — מודל **Ionic**
  (`ModalController`), נפתח דרך `ExpenseDataService.openModalAddExpense()`
  ([expense-data.service.ts:249](../frontend/src/app/services/expense-data.service.ts#L249)).
  זהו למעשה הפריסה הדו-טורית האמיתית (טופס 50% | תצוגת קבלה `flex:2`,
  `<img>`/`<object>` ל-PDF) — אבל זה Ionic, reactive forms, ומשמש דפים לא
  קשורים (FAB גלובלי, my-storage).
- **`components/mannual-expense/` (`MannualExpenseComponent`)** — דיאלוג
  **PrimeNG `DynamicDialogService`**, standalone/signals, אבל הפריסה שלו
  טור-אחד עם תצוגת קובץ **מתחת** לטופס, לא לצדו (ה-`.scss` שלו עדיין מכיל
  CSS דו-טורי מת, שהועתק מ-`modal.component.scss` ואינו תואם לתבנית שלו).

אף אחת מהשתיים אינה מחווטת ל-`report-review` היום, ולהביא אחת מהן פנימה
משמעו לייבא framework דיאלוגים חדש לעמוד הזה בלי צורך.

**התבנית שבאמת מתאימה: `p-dialog`, כבר בשימוש 4 פעמים באותו קובץ בדיוק** —
`customPeriodVisible`, `supplierConflictsVisible`, `completionVisible`,
`simplePickerVisible`
([report-review.page.html:446-671](../frontend/src/app/pages/report-review/report-review.page.html#L446-L671))
הם כולם `p-dialog` רגילים עם `[modal]="true" [rtl]="true"`. הפופאפ החדש
לעריכה צריך להיות דיאלוג חמישי, אח לארבעת הקיימים — אותו framework, אותה
קונבנציה, אין תלות חדשה.

**אין קומפוננטת "Drive preview" משותפת/generic בשום מקום.** ה-iframe
(`https://drive.google.com/file/d/${fileId}/preview` דרך `previewUrl`
computed מסוג `SafeResourceUrl`) הוא קוד inline חד-פעמי ב-
[report-review.page.ts:304-336](../frontend/src/app/pages/report-review/report-review.page.ts#L304-L336)
ו-[report-review.page.html:6-26](../frontend/src/app/pages/report-review/report-review.page.html#L6-L26).
זו הפריסה הדו-טורית (טופס|תצוגה) היחידה בכל `frontend/src/app` חוץ מהמודל
ה-Ionic — ניקח את אותה לוגיקת ה-iframe אל תוך הדיאלוג החדש.

**ממצא חשוב, לא-מובן-מאליו, על סמנטיקת "שמירה":** היום, "עריכה" inline →
עריכת שדות → "שמור"
(`toggleEditRow`/`saveEditRow`, [report-review.page.ts:710-723](../frontend/src/app/pages/report-review/report-review.page.ts#L710-L723))
**לא** קוראים לשום endpoint בבקאנד — הם רק כותבים ל-row הזיכרון וממחזרים את
הנעילה. השמירה בפועל קורית רק דרך צ'קבוקס + כפתור התחתון
"אישור הוצאות נבחרות"
(`bulkApproveSelected` → `approveObsForRow` → `approveMatched`/
`approveDocCash`/`approveTxNoDoc`,
[report-review.page.ts:2141](../frontend/src/app/pages/report-review/report-review.page.ts#L2141)),
או דרך "שמור בכל זאת" בשורת כפילות רכה
([report-review.page.ts:1769](../frontend/src/app/pages/report-review/report-review.page.ts#L1769)).
כלומר: כפתור "שמור" בפופאפ החדש חייב לחקות בדיוק את ההתנהגות הנוכחית —
לכתוב את השדות בחזרה על ה-row ולסגור, **בלי** לקרוא ל-approve endpoint —
בדיוק תואם לדרישה "הלוגיקה של השמירה/אישור לא משתנה".

---

## 2. רשימת השדות לפי סוג שורה (מהקוד, לא הנחה)

**משותף לכל שלושת הסוגים** (matched / doc_only / tx_only):
- קטגוריה + תת-קטגוריה (תצוגה רגילה) — *או* בורר כרטיס הנהלת חשבונות
  (תצוגה מקצועית) — אותו שדה בפועל, הבדל רק ב-D9 view-mode
- % מע"מ, % מס
- תאריך, סכום
- מס' עוסק (supplierId), שם ספק
- תקופת דיווח (+ תת-דיאלוג "אחר" לתקופה מותאמת אישית)

**רק ל-matched + doc_only** (`row.type !== 'tx_only'`):
- מספר הקצאה (allocationNumber)
- סוג מסמך (dropdown)
- דגל "ספק חדש" (מוצג רק כש-`supplierStatusLabel === 'ספק חדש'` — לעולם לא
  נכון ב-tx_only)
- אזור תצוגת המסמך (driveFileId)

**נקודה פתוחה לבדיקה שלך:** "מס' חשבונית" (invoiceNumber) ניתן לעריכה היום
בטמפלט **בלי** type-guard, גם בשורות tx_only — אבל זה חסר משמעות שם (אין
מסמך). המלצה: להשמיט אותו מהפופאפ של tx_only במקום לגרור עודף UI. ההחלטה
בידך.

**מקצועי-בלבד, read-only** (אין צורך בשדה קלט): % פחת (reductionPercent) —
נגזר מהכרטיס שנבחר, אין לבקאנד override slot בשבילו.

שורות "מסמך שנתי" ו"לא מזוהה" (D8) לא מקבלות פעולת "עריכה" היום כלל
(`showWhen` מוציא אותן) — הפופאפ החדש יורש את אותו חריג.

---

## 3. סקיצת layout

**matched / doc_only — שני טורים** (משקף את הפיצול 58/40 הקיים בעמוד,
[report-review.page.scss:19-40](../frontend/src/app/pages/report-review/report-review.page.scss#L19-L40)):

```
┌────────────────────────────────────────────────────────┐
│ עריכת הוצאה — {supplier}                            [X] │
├───────────────────────────────┬────────────────────────┤
│ ספק [___] מס' עוסק [___]       │ [Drive iframe]         │
│ תאריך [__] סכום [__]           │  filename header       │
│ סוג מסמך [▼] מס' חשבונית [__]  │  (גלילה)               │
│ מס' הקצאה [__]                 │                        │
│ קטגוריה[▼] תת-קטג[▼]           │                        │
│  (או: כרטיס[▼] — מקצועי)       │                        │
│ %מע"מ[__] %מס[__]              │                        │
│ תקופת דיווח [▼]                │                        │
│ [ ] ספק חדש — הוסף לרשימה      │                        │
├───────────────────────────────┴────────────────────────┤
│                                    [ביטול]   [שמור]     │
└────────────────────────────────────────────────────────┘
```

**tx_only — רוחב מלא, טור אחד, בלי אזור מסמך בכלל:**

```
┌────────────────────────────────────────────────────────┐
│ עריכת תנועה — {merchant}                             [X]│
├──────────────────────────────────────────────────────────┤
│ ספק [___]           מס' עוסק [___]                       │
│ תאריך [__]          סכום [__]                            │
│ קטגוריה[▼]          תת-קטג[▼]  (או: כרטיס[▼])            │
│ %מע"מ[__]           %מס[__]                               │
│ תקופת דיווח [▼]                                           │
├──────────────────────────────────────────────────────────┤
│                                    [ביטול]   [שמור]      │
└──────────────────────────────────────────────────────────┘
```

**מנגנון:** דיאלוג אחד, `mode` נגזר מ-`!!row.driveFileId` (שקול ל-
`row.type !== 'tx_only'`), שמרנדר באופן מותנה את פאנל התצוגה `<aside>`
בצד ימין — אותו רעיון `[class.with-preview]` שהעמוד כבר מיישם, רק בהיקף
הדיאלוג. צד הטופס גם ממשיך להסתעף לפי `viewMode()` (רגיל מול מקצועי) בדיוק
כמו היום ב-inline.

---

## החלטות פתוחות לפני מימוש

1. אישור: `p-dialog` אח לארבעת הקיימים (לא Ionic modal, לא
   `DynamicDialogService`)?
2. להשמיט "מס' חשבונית" מהפופאפ של tx_only, או להשאיר לעקביות?
3. קומפוננטת ילד חדשה ונפרדת (למשל `report-review-edit-dialog`), או inline
   בתוך `report-review.page.html` כמו ארבעת הדיאלוגים המשניים האחרים?

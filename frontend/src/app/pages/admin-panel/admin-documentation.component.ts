import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DocumentationTopicComponent } from './documentation-topic.component';

export interface DocumentationFlowStep {
  icon: string;
  title: string;
  description: string;
}

export interface DocumentationCallout {
  icon: string;
  title: string;
  text: string;
  tone: 'blue' | 'green' | 'amber';
}

export interface DocumentationTopic {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  behavior: string[];
  flowTitle: string;
  flow: DocumentationFlowStep[];
  callouts: DocumentationCallout[];
  notes: string[];
}

export interface DocumentationModule {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  accent: string;
  tint: string;
  topics: DocumentationTopic[];
}

interface SearchResult {
  module: DocumentationModule;
  topic: DocumentationTopic;
}

@Component({
  selector: 'app-admin-documentation',
  templateUrl: './admin-documentation.component.html',
  styleUrls: ['./admin-documentation.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, DocumentationTopicComponent],
})
export class AdminDocumentationComponent {
  readonly modules: DocumentationModule[] = [
    {
      id: 'accounting',
      title: 'הנהלת חשבונות',
      shortTitle: 'הנהלת חשבונות',
      description: 'מסמכים, הוצאות, פקודות יומן, כרטיסים ודוחות — מתנועת המקור ועד לתוצאה החשבונאית.',
      icon: 'calculator-outline',
      accent: '#3157d5',
      tint: '#eef2ff',
      topics: [
        {
          id: 'accounting-overview',
          title: 'תמונת מצב',
          eyebrow: 'איך הכול מתחבר',
          description: 'המערכת מפרידה בין מסמך המקור, הסיווג החשבונאי ופקודת היומן. הדוחות קוראים את היומן כדי שכל מספר יהיה ניתן להסבר ולמעקב.',
          behavior: [
            'הכנסה, הוצאה או התאמה מתחילות תמיד ברשומת מקור שנשמרת עם העסק והמשתמש הנכונים.',
            'הסיווג קובע את הכרטיס, שיעורי ההכרה, המע״מ, חתך רווח והפסד וקוד 6111.',
            'פקודת היומן שומרת כותרת ושורות חובה/זכות מאוזנות, עם קישור חזרה למקור.',
            'רווח והפסד, מע״מ וכרטסת מחושבים מהפקודות שנרשמו — לא מסיכום מקביל ונסתר.',
          ],
          flowTitle: 'המסלול החשבונאי המרכזי',
          flow: [
            { icon: 'document-text-outline', title: 'מקור', description: 'מסמך, הוצאה או תנועה' },
            { icon: 'git-branch-outline', title: 'סיווג', description: 'קטגוריה וכרטיס חשבון' },
            { icon: 'swap-horizontal-outline', title: 'פקודת יומן', description: 'חובה וזכות מאוזנות' },
            { icon: 'analytics-outline', title: 'דוחות', description: 'מע״מ, רו״ה וכרטסת' },
          ],
          callouts: [
            { icon: 'shield-checkmark-outline', title: 'מקור אמת אחד', text: 'היומן הוא המקור לדוחות החשבונאיים, ולכן אפשר לרדת מכל סכום לתנועה שהרכיבה אותו.', tone: 'blue' },
            { icon: 'lock-closed-outline', title: 'תקופה שדווחה', text: 'שינוי שמשפיע על היומן נחסם לאחר שהתקופה סומנה כדווחה.', tone: 'amber' },
          ],
          notes: ['כל פקודה מקבלת מספר רץ ברמת העסק.', 'הסכומים נשמרים בש״ח; המרת מטבע מתבצעת לפני הרישום ביומן.'],
        },
        {
          id: 'documents',
          title: 'הפקת מסמך',
          eyebrow: 'הכנסות ומסמכים רשמיים',
          description: 'יצירת חשבונית, קבלה או זיכוי כוללת מספור, חישובי שורות ומע״מ, שמירה, PDF ורישום חשבונאי בהתאם לסוג המסמך.',
          behavior: [
            'המשתמש בוחר סוג מסמך, לקוח, שורות ופרטי תשלום; המערכת מחשבת הנחות, מע״מ וסכום סופי.',
            'לכל סוג מסמך יש מונה רץ נפרד ברמת העסק. המספר מתקדם רק לאחר שמירה מוצלחת.',
            'במסמכים החייבים במספר הקצאה, תהליך רשות המסים משתלב לפני ההשלמה הסופית.',
            'מסמכים שמייצרים הכנסה נרשמים ביומן ומקושרים לפקודה; PDF נשמר וניתן לשליחה.',
          ],
          flowTitle: 'מחזור החיים של מסמך',
          flow: [
            { icon: 'create-outline', title: 'עריכה', description: 'לקוח, שורות ותשלום' },
            { icon: 'checkmark-circle-outline', title: 'אימות', description: 'מספור, סכומים והקצאה' },
            { icon: 'save-outline', title: 'שמירה', description: 'מסמך, שורות ו-PDF' },
            { icon: 'book-outline', title: 'רישום', description: 'פקודת הכנסה ביומן' },
          ],
          callouts: [
            { icon: 'refresh-outline', title: 'פעולה אטומית', text: 'כשל בתהליך ההשלמה מחזיר את המסמך והמונים למצב בטוח במקום להשאיר מספור חלקי.', tone: 'green' },
            { icon: 'link-outline', title: 'קישור למקור', text: 'פקודת היומן שומרת סוג ומזהה מסמך, כך שאפשר להבין מאיפה נוצרה.', tone: 'blue' },
          ],
          notes: ['טיוטה אינה מסמך סופי ואינה אמורה לייצר הכנסה ביומן.', 'זיכוי מקושר למסמך המקור והסימנים ביומן הפוכים בהתאם.'],
        },
        {
          id: 'expenses',
          title: 'הוצאות ופחת',
          eyebrow: 'קליטה, הכרה ורכוש קבוע',
          description: 'הוצאה יכולה להגיע מהזנה ידנית, OCR או תנועת בנק. לאחר סיווג ואישור היא נרשמת בכרטיס המתאים, כולל טיפול אוטומטי בפחת.',
          behavior: [
            'הסיווג מצלם על ההוצאה את הכרטיס והחוק החשבונאי שהיו בתוקף בזמן האישור.',
            'אחוז ההכרה למס ומע״מ קובע את הסכומים המוכרים בדוחות; הוצאה פרטית אינה נרשמת ביומן.',
            'רכוש קבוע נרשם כציוד ולכן הרכישה עצמה אינה נכנסת כהוצאה שוטפת לרווח והפסד.',
            'פחת בשנת ההפעלה נוצר אוטומטית באופן יחסי לימים; שנים עתידיות נוצרות בהכנת דוח רווח והפסד.',
          ],
          flowTitle: 'מהוצאה גולמית להוצאה מוכרת',
          flow: [
            { icon: 'cloud-upload-outline', title: 'קליטה', description: 'ידני, OCR או בנק' },
            { icon: 'pricetag-outline', title: 'סיווג', description: 'כרטיס ואחוזי הכרה' },
            { icon: 'checkmark-done-outline', title: 'אישור', description: 'בדיקות כפילות ותקופה' },
            { icon: 'book-outline', title: 'יומן', description: 'הוצאה, מע״מ ובנק' },
          ],
          callouts: [
            { icon: 'calendar-number-outline', title: 'תאריך הפעלה נפרד', text: 'פחת מתחיל ביום שבו הנכס זמין לשימוש, ולא בהכרח ביום הרכישה.', tone: 'green' },
            { icon: 'copy-outline', title: 'מניעת כפילות', text: 'רכישת ציוד מסומנת מחוץ לרו״ה; רק שורת הפחת המוכרת נכנסת לדוח.', tone: 'blue' },
          ],
          notes: ['תאריך הפעלה מוקדם מתאריך רכישה נדחה.', 'עריכת ציוד מסנכרנת את שנות הפחת שכבר נוצרו.'],
        },
        {
          id: 'reports',
          title: 'דוחות',
          eyebrow: 'בקרה, דיווח ויצוא',
          description: 'מרכז הדוחות מציג את אותה פעילות מזוויות שונות: מס, תוצאה עסקית, תנועות בכרטיס ופחת.',
          behavior: [
            'דוח מע״מ מפריד בין עסקאות חייבות, פטורות, מע״מ עסקאות ותשומות על הוצאות או נכסים.',
            'רווח והפסד מקבץ כרטיסי הכנסה והוצאה לפי חתכים חשבונאיים ומשתמש בסכום המוכר למס.',
            'כרטסת מציגה תנועות לפי כרטיס, חשבון נגדי ויתרה רצה, כולל יתרת פתיחה מחושבת לתקופה.',
            'טופס 1342 מציג עלות, שיעור פחת, פחת השנה, פחת נצבר ויתרה לכל נכס.',
          ],
          flowTitle: 'לפני שמפיקים דוח',
          flow: [
            { icon: 'calendar-outline', title: 'תקופה', description: 'עסק וטווח תאריכים' },
            { icon: 'search-outline', title: 'סקירה', description: 'מסמכים ותנועות חסרות' },
            { icon: 'options-outline', title: 'הכנה', description: 'השלמת רישומים אוטומטיים' },
            { icon: 'download-outline', title: 'תוצאה', description: 'מסך, PDF או קובץ' },
          ],
          callouts: [
            { icon: 'eye-outline', title: 'עקיבות', text: 'כרטסת ופירוט הוצאות מאפשרים לעבור מהסכום המסכם אל התנועות המרכיבות אותו.', tone: 'blue' },
            { icon: 'alert-circle-outline', title: 'בדיקת קדם-דוח', text: 'מסמכים ותנועות לא מאושרים צריכים להיפתר לפני סימון התקופה כדווחה.', tone: 'amber' },
          ],
          notes: ['PDF של רווח והפסד מכין פחת חסר לפני ההפקה.', 'מבנה אחיד מיוצר כקובץ ZIP בפורמט הנדרש לרשות המסים.'],
        },
        {
          id: 'catalog',
          title: 'כרטיסים וסיווגים',
          eyebrow: 'תרשים החשבונות',
          description: 'הקטגוריה היא שפת המשתמש; תת-הקטגוריה מצביעה לכרטיס חשבונאי, והכרטיס מחזיק את כללי המס, המע״מ והדיווח.',
          behavior: [
            'כרטיס כולל קוד, סוג, חתך, קוד 6111, אחוזי הכרה, סימון ציוד והיקף דוח.',
            'שינוי באחוזים יוצר או בוחר כרטיס מתאים במקום לשנות בדיעבד חוק של תנועות היסטוריות.',
            'מיזוג הקטלוג עובד לפי קדימות: הגדרת לקוח, אחריה הגדרת רואה חשבון ולבסוף ברירת המחדל של המערכת.',
            'סיווג ללא מיפוי חשבונאי נשמר לבירור אך אינו מקבל בשקט כרטיס כללי.',
          ],
          flowTitle: 'היררכיית הסיווג',
          flow: [
            { icon: 'folder-open-outline', title: 'קטגוריה', description: 'קבוצת תצוגה למשתמש' },
            { icon: 'pricetags-outline', title: 'תת-קטגוריה', description: 'בחירת הסיווג בפועל' },
            { icon: 'card-outline', title: 'כרטיס', description: 'החוק החשבונאי המלא' },
            { icon: 'layers-outline', title: 'חתך', description: 'קיבוץ ברווח והפסד' },
          ],
          callouts: [
            { icon: 'git-compare-outline', title: 'קדימות ללא דריסה', text: 'התאמה ללקוח יכולה לגבור על ברירת המחדל בלי לשנות אותה ללקוחות אחרים.', tone: 'green' },
            { icon: 'warning-outline', title: 'מיפוי חסר גלוי', text: 'רשומה חסרת כרטיס מסומנת במפורש ודורשת השלמה לפני רישום ביומן.', tone: 'amber' },
          ],
          notes: ['כרטיסים טכניים יכולים להתקיים ללא תת-קטגוריה לבחירה.', 'מחיקת קטגוריה היא רכה כדי לא לשבור תנועות היסטוריות.'],
        },
      ],
    },
    {
      id: 'open-banking',
      title: 'בנקאות פתוחה',
      shortTitle: 'בנקאות פתוחה',
      description: 'הסכמה מאובטחת, גילוי חשבונות וכרטיסים, סנכרון תנועות והעברה למסלול הבדיקה והסיווג.',
      icon: 'business-outline',
      accent: '#0b8276',
      tint: '#eafaf7',
      topics: [
        {
          id: 'banking-overview',
          title: 'תמונת מצב',
          eyebrow: 'מחיבור הבנק לתנועה',
          description: 'המערכת משתמשת בספק AISP כדי לקבל הרשאה מוגבלת ולייבא מידע פיננסי. פרטי ההזדהות לבנק אינם נשמרים באתר.',
          behavior: [
            'המשתמש מתחיל חיבור ומועבר למסך ההסכמה של ספק הבנקאות הפתוחה.',
            'לאחר אישור מתקבלים אירועים שמסמנים מתי החשבונות והנתונים זמינים.',
            'המערכת מגלה חשבונות וכרטיסים, שומרת מקורות ומייבאת תנועות בפורמט אחיד.',
            'התנועות עוברות מניעת כפילות, סיווג ובדיקת משתמש לפני הפיכתן להוצאות.',
          ],
          flowTitle: 'זרימת הבנקאות הפתוחה',
          flow: [
            { icon: 'person-circle-outline', title: 'הסכמה', description: 'אישור אצל הבנק' },
            { icon: 'radio-outline', title: 'אירוע', description: 'הנתונים זמינים' },
            { icon: 'server-outline', title: 'סנכרון', description: 'חשבונות ותנועות' },
            { icon: 'checkmark-done-outline', title: 'סקירה', description: 'התאמה וסיווג' },
          ],
          callouts: [
            { icon: 'key-outline', title: 'ללא סיסמת בנק', text: 'הכניסה וההסכמה מתבצעות מחוץ לאתר; המערכת מקבלת הרשאה ותוצאות דרך הספק.', tone: 'green' },
            { icon: 'finger-print-outline', title: 'ייבוא אידמפוטנטי', text: 'מזהים יציבים ונרמול מונעים שמירה חוזרת של אותה תנועה.', tone: 'blue' },
          ],
          notes: ['גישה למודול תלויה בחבילת המנוי OPEN_BANKING.', 'סיום או ביטול הסכמה מנקה מזהי הסכמה שאינם תקפים.'],
        },
        {
          id: 'consent',
          title: 'הסכמה והרשאות',
          eyebrow: 'חיבור מבוקר',
          description: 'הסכמה היא הרשאה מוגבלת בזמן ובמטרות. האתר יוצר קישור חתום ומעביר את המשתמש לתהליך החיצוני.',
          behavior: [
            'בקשת החיבור נחתמת ומקושרת למשתמש הנכון לפני ההפניה.',
            'המשתמש בוחר בנק ומאשר את היקף המידע בממשק החיצוני.',
            'שינוי סטטוס ההסכמה מתקבל ב-webhook ונשמר ביומן אירועים לצורכי מעקב.',
            'אירוע חוזר מזוהה לפי תוכן ואינו מעובד פעמיים.',
          ],
          flowTitle: 'מחזור ההסכמה',
          flow: [
            { icon: 'link-outline', title: 'קישור חתום', description: 'יוזמה מהאתר' },
            { icon: 'open-outline', title: 'הפניה', description: 'בחירת בנק ואישור' },
            { icon: 'mail-open-outline', title: 'Webhook', description: 'עדכון סטטוס' },
            { icon: 'shield-checkmark-outline', title: 'הרשאה פעילה', description: 'אפשר לסנכרן נתונים' },
          ],
          callouts: [
            { icon: 'time-outline', title: 'הרשאה מתחדשת', text: 'כאשר ההסכמה פגה או מבוטלת, יש לבצע חיבור מחדש במקום להמשיך עם הרשאה ישנה.', tone: 'amber' },
          ],
          notes: ['ה-webhook הציבורי מחזיר תשובה מהירה והעיבוד מתבצע בנפרד.', 'כל אירוע נשמר עם סטטוס עיבוד לצורך אבחון.'],
        },
        {
          id: 'sync',
          title: 'סנכרון ומניעת כפילות',
          eyebrow: 'חשבונות, כרטיסים ותנועות',
          description: 'נתוני בנק וכרטיס מגיעים במבנים שונים. שכבת הנרמול הופכת אותם לתנועה אחידה לפני השמירה.',
          behavior: [
            'מקורות מתגלים מחדש ונשמרים בעדכון בטוח, כולל יתרות ומאפייני כרטיס.',
            'תנועות בנק וכרטיס מנורמלות למזהה תשלום, מטבע, תאריך, סכום ותיאור אחידים.',
            'כרטיס דביט ישיר אינו מיובא גם ככרטיס וגם דרך החשבון — תנועותיו מגיעות מפיד הבנק בלבד.',
            'כשל חלקי נשמר ברמת המקור ומאפשר ניסיון חוזר רק למקורות המתאימים.',
          ],
          flowTitle: 'צינור הסנכרון',
          flow: [
            { icon: 'cloud-download-outline', title: 'משיכה', description: 'API של חשבון או כרטיס' },
            { icon: 'funnel-outline', title: 'נרמול', description: 'מבנה תנועה אחיד' },
            { icon: 'copy-outline', title: 'Dedup', description: 'זיהוי תנועה קיימת' },
            { icon: 'database-outline', title: 'שמירה', description: 'מקור וסטטוס סנכרון' },
          ],
          callouts: [
            { icon: 'card-outline', title: 'כרטיס ישיר', text: 'Direct/Debit מסומן כ-skipped_direct בסנכרון כרטיסים כדי למנוע כפילות עם חשבון הבנק.', tone: 'blue' },
            { icon: 'repeat-outline', title: 'Retry ממוקד', text: 'המערכת מנסה שוב מקור שנכשל, בלי למשוך מחדש מקורות שהסתיימו בהצלחה.', tone: 'green' },
          ],
          notes: ['אם משיכת רשימת הכרטיסים נכשלת, המערכת אינה מנחשת מי מהם כרטיס ישיר.', 'סטטוס הסנכרון נשמר כדי להסביר למשתמש הצלחה מלאה או חלקית.'],
        },
        {
          id: 'transaction-review',
          title: 'סקירת תנועות',
          eyebrow: 'מתנועה בנקאית להוצאה',
          description: 'תנועה מיובאת אינה הופכת מיד לרישום חשבונאי. היא עוברת התאמה למסמך, סיווג ואישור.',
          behavior: [
            'המערכת מחפשת מסמך מתאים לפי עסק, סכום ותאריך בטווח מוגדר.',
            'המשתמש יכול לאשר התאמה, לצרף מסמך, לאשר תנועה ללא מסמך או לדחות אותה.',
            'הקטלוג מציע סיווג וכרטיס, אך מיפוי חסר נשאר גלוי ודורש טיפול.',
            'רק לאחר האישור נוצרת הוצאה ונרשמת פקודת היומן המתאימה.',
          ],
          flowTitle: 'שלב הבקרה האנושי',
          flow: [
            { icon: 'receipt-outline', title: 'תנועה', description: 'מידע מהבנק' },
            { icon: 'git-compare-outline', title: 'התאמה', description: 'מסמך מול תנועה' },
            { icon: 'pricetag-outline', title: 'סיווג', description: 'קטגוריה וכרטיס' },
            { icon: 'checkmark-circle-outline', title: 'אישור', description: 'יצירת הוצאה ויומן' },
          ],
          callouts: [
            { icon: 'person-outline', title: 'אישור לפני רישום', text: 'ייבוא בנקאי הוא חומר גלם; הוא אינו משנה את הספרים לפני החלטת המשתמש.', tone: 'amber' },
          ],
          notes: ['התאמה אוטומטית משתמשת בסבילות מוגבלת של תאריך וסכום.', 'מסמך ותנועה שאושרו מסומנים כדי שלא יחזרו לסבב הבא.'],
        },
      ],
    },
    {
      id: 'billing',
      title: 'סליקה ומנויים',
      shortTitle: 'סליקה',
      description: 'תוכניות, תקופת ניסיון, תשלום מאובטח ב-CardCom, הפעלת מנוי, חידושים וקבלות.',
      icon: 'card-outline',
      accent: '#c15318',
      tint: '#fff4eb',
      topics: [
        {
          id: 'billing-overview',
          title: 'תמונת מצב',
          eyebrow: 'מתוכנית לגישה למודולים',
          description: 'המנוי מחבר בין תוכנית מחיר, אמצעי תשלום והרשאות למודולים. תוצאת סליקה מאומתת — לא החזרה מהדפדפן — מפעילה את המנוי.',
          behavior: [
            'תוכנית מגדירה מחיר, ימי ניסיון והמודולים הכלולים: מסמכים, בנקאות פתוחה או רואה חשבון.',
            'הלקוח מקבל תצוגה מקדימה של המחיר לפני פתיחת עמוד התשלום המאובטח.',
            'CardCom שולחת webhook לאחר התשלום; רק עיבוד מאומת שלו משנה את מצב המנוי.',
            'הרשאות המערכת נבדקות מול מצב המנוי והמודולים הכלולים בכל כניסה לפיצ׳ר מוגן.',
          ],
          flowTitle: 'זרימת רכישת מנוי',
          flow: [
            { icon: 'albums-outline', title: 'תוכנית', description: 'מחיר ומודולים' },
            { icon: 'calculator-outline', title: 'תצוגה מקדימה', description: 'הנחה, מע״מ וסכום' },
            { icon: 'lock-closed-outline', title: 'CardCom', description: 'עמוד תשלום מאובטח' },
            { icon: 'flash-outline', title: 'הפעלה', description: 'Webhook מאומת' },
          ],
          callouts: [
            { icon: 'shield-checkmark-outline', title: 'השרת קובע', text: 'הפניית הצלחה בדפדפן אינה הוכחת תשלום; ה-webhook המאומת הוא שמפעיל מנוי.', tone: 'blue' },
            { icon: 'receipt-outline', title: 'תיעוד מלא', text: 'אירועי חיוב נשמרים ביומן ביקורת ויכולים להיות מקושרים לקבלה שהמערכת מפיקה.', tone: 'green' },
          ],
          notes: ['תקופת ניסיון נוצרת באופן אידמפוטנטי — לא ניתן לצבור ניסיונות חוזרים.', 'לכל משתמש קיימת רשומת מנוי פעילה אחת.'],
        },
        {
          id: 'checkout',
          title: 'תהליך סליקה',
          eyebrow: 'Checkout ו-webhook',
          description: 'הסליקה מתבצעת בעמוד LowProfile של CardCom. האתר שומר את הקשר לעסקה וממתין לתוצאה מהשרת של חברת הסליקה.',
          behavior: [
            'השרת מחשב את המחיר הסופי ופותח עסקת LowProfile עם כתובות חזרה ו-webhook.',
            'פרטי הכרטיס מוקלדים בסביבת CardCom ולא נשמרים כפרטי כרטיס מלאים באתר.',
            'קריאת webhook נשמרת עם מפתח אידמפוטנטיות כדי למנוע חיוב או הפעלה כפולים.',
            'לאחר הצלחה נשמר token לשימוש עתידי, המנוי מופעל ונוצר אירוע חיוב.',
          ],
          flowTitle: 'מי מדבר עם מי',
          flow: [
            { icon: 'phone-portrait-outline', title: 'האתר', description: 'יוצר עסקת סליקה' },
            { icon: 'card-outline', title: 'CardCom', description: 'קולט ומעבד תשלום' },
            { icon: 'notifications-outline', title: 'Webhook', description: 'מחזיר תוצאה לשרת' },
            { icon: 'checkmark-done-outline', title: 'מערכת', description: 'מפעילה ומתעדת' },
          ],
          callouts: [
            { icon: 'sync-outline', title: 'Webhook חוזר', text: 'אותה הודעה יכולה להגיע יותר מפעם אחת; המפתח הייחודי מבטיח עיבוד יחיד.', tone: 'green' },
            { icon: 'alert-circle-outline', title: 'תשובה מהירה לספק', text: 'גם כשיש תקלה פנימית ה-endpoint נמנע מיצירת סערת ניסיונות חוזרים מצד CardCom.', tone: 'amber' },
          ],
          notes: ['בסביבת פיתוח כתובת ה-webhook הציבורית חייבת להיות עדכנית בזמן יצירת העסקה.', 'קבלה ניתנת להפקה מחדש או לשליחה חוזרת מתוך אירוע החיוב.'],
        },
        {
          id: 'renewals',
          title: 'חידושים ואמצעי תשלום',
          eyebrow: 'מחזור חיוב מתמשך',
          description: 'לאחר התשלום הראשון המערכת משתמשת ב-token השמור לחידושים, מנהלת ניסיונות ומתעדת הצלחה או כשל.',
          behavior: [
            'תהליך חידוש מאתר מנויים שהגיע מועד החיוב שלהם ומחשב מחיר לאחר הנחה.',
            'החיוב משתמש ב-token ולא במספר הכרטיס; כל ניסיון נרשם באירועי החיוב.',
            'כשל מגדיל את מונה הניסיונות ומשאיר מידע תפעולי להמשך טיפול.',
            'החלפת אמצעי תשלום היא עסקת token-only שאינה מחייבת את הכרטיס.',
          ],
          flowTitle: 'מחזור חידוש',
          flow: [
            { icon: 'calendar-outline', title: 'מועד חיוב', description: 'המנוי הגיע לחידוש' },
            { icon: 'pricetag-outline', title: 'תמחור', description: 'תוכנית והנחה' },
            { icon: 'repeat-outline', title: 'חיוב token', description: 'ניסיון מאובטח' },
            { icon: 'receipt-outline', title: 'תוצאה', description: 'תקופה חדשה וקבלה' },
          ],
          callouts: [
            { icon: 'swap-horizontal-outline', title: 'החלפת כרטיס ללא חיוב', text: 'CreateTokenOnly מעדכן את אמצעי התשלום; סטטוס הפעולה נבדק לפי ניסיון ספציפי.', tone: 'blue' },
            { icon: 'trail-sign-outline', title: 'התאוששות', text: 'אם webhook של החלפת כרטיס לא הגיע, polling יכול לבצע reconciliation מול CardCom לאחר פרק המתנה.', tone: 'green' },
          ],
          notes: ['חידוש אוטומטי ומנגנון הרצה ידני משתמשים באותו שירות.', 'הנחה יכולה להיות באחוזים, בסכום קבוע ובטווח תאריכים מוגדר.'],
        },
        {
          id: 'billing-admin',
          title: 'ניהול תוכניות ומנויים',
          eyebrow: 'כלים תפעוליים',
          description: 'טאב הניהול מאפשר לתחזק את קטלוג התוכניות, לצפות במנויים, לעדכן הנחות ולהריץ חידושים מבוקרים.',
          behavior: [
            'מנהל יכול ליצור ולעדכן תוכנית, מחיר, תקופת ניסיון, תצוגה והמודולים הכלולים.',
            'רשימת המנויים מציגה סטטוס, תוכנית, תקופה, מועד חיוב והנחה.',
            'אפשר להחיל הנחה נקודתית למנוי בלי לשנות את מחיר התוכנית לכל הלקוחות.',
            'הרצת חידוש מנהלית מחזירה סיכום הצלחות וכישלונות לצורך בקרה.',
          ],
          flowTitle: 'בקרת מנהל',
          flow: [
            { icon: 'construct-outline', title: 'תוכנית', description: 'מחיר, מודולים וחשיפה' },
            { icon: 'people-outline', title: 'מנויים', description: 'מצב ותקופות' },
            { icon: 'ticket-outline', title: 'הנחות', description: 'כלל אישי וזמני' },
            { icon: 'play-outline', title: 'חידוש', description: 'הרצה וסיכום תוצאות' },
          ],
          callouts: [
            { icon: 'eye-off-outline', title: 'השבתה בטוחה', text: 'ניתן להסתיר או להשבית תוכנית בלי למחוק היסטוריית מנויים וחיובים.', tone: 'amber' },
          ],
          notes: ['מסכי הניהול מוגנים בהרשאת מנהל.', 'אירועי החיוב נשמרים כתיעוד מצטבר ואינם נדרסים.'],
        },
      ],
    },
  ];

  activeModuleId = this.modules[0].id;
  activeTopicId = this.modules[0].topics[0].id;
  searchTerm = '';

  get activeModule(): DocumentationModule {
    return this.modules.find((module) => module.id === this.activeModuleId) ?? this.modules[0];
  }

  get activeTopic(): DocumentationTopic {
    return this.activeModule.topics.find((topic) => topic.id === this.activeTopicId)
      ?? this.activeModule.topics[0];
  }

  get searchResults(): SearchResult[] {
    const query = this.searchTerm.trim().toLocaleLowerCase('he');
    if (!query) return [];

    return this.modules.flatMap((module) => module.topics
      .filter((topic) => [
        module.title,
        topic.title,
        topic.eyebrow,
        topic.description,
        ...topic.behavior,
        ...topic.notes,
      ].join(' ').toLocaleLowerCase('he').includes(query))
      .map((topic) => ({ module, topic })));
  }

  selectModule(module: DocumentationModule): void {
    this.activeModuleId = module.id;
    this.activeTopicId = module.topics[0].id;
    this.searchTerm = '';
  }

  selectTopic(topic: DocumentationTopic): void {
    this.activeTopicId = topic.id;
  }

  openSearchResult(result: SearchResult): void {
    this.activeModuleId = result.module.id;
    this.activeTopicId = result.topic.id;
    this.searchTerm = '';
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}

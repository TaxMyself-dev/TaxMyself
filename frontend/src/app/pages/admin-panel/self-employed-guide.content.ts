import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

export type GuideSlideLayout =
  | 'study-comparison'
  | 'cover'
  | 'business-types'
  | 'authorities'
  | 'income-overview'
  | 'status-comparison'
  | 'micro-blockers'
  | 'income-combination'
  | 'approved-artwork'
  | 'ni-simulator'
  | 'ni-rates'
  | 'tax-simulator'
  | 'expense-principle'
  | 'expense-savings';

export interface GuideItem {
  label: string;
  description: string;
  category?: string;
  icon?: string;
  targetSlideId?: string;
  available?: boolean;
}

export interface GuideSource {
  label: string;
  url: string;
}

export interface GuideSlide {
  id: string;
  layout: GuideSlideLayout;
  title: string;
  subtitle?: string;
  items?: GuideItem[];
  takeaway?: string;
  sources?: GuideSource[];
  artwork?: string;
  artworkAlt?: string;
}

const figures = SELF_EMPLOYED_GUIDE_FIGURES;
const ceiling = new Intl.NumberFormat('he-IL').format(figures.vatExemptTurnoverCeiling);

export const SELF_EMPLOYED_GUIDE_SLIDES: GuideSlide[] = [
  {
    id: 'learning-summary', layout: 'approved-artwork', title: 'אז מה למדנו עד עכשיו?',
    artwork: '/assets/self-employed-guide/learning-summary-approved.png',
    artworkAlt: 'אז מה למדנו עד עכשיו? סוג העסק — פטור ומורשה הם מעמד במע״מ. עסק זעיר הוא מסלול במס הכנסה. מס הכנסה — מחושב על ההכנסה החייבת, כולל השכר והרווח מהעסק. מע״מ — מס על עסקאות, לא על הרווח. ביטוח לאומי — התשלום תלוי במעמד ובהכנסות. מקדמות — תשלומים במהלך השנה על חשבון החיוב הסופי, למי שחייב.',
  },
  {
    id: 'practical-transition', layout: 'approved-artwork', title: 'ועכשיו לתכל׳ס',
    artwork: '/assets/self-employed-guide/practical-transition-approved.png',
    artworkAlt: 'ועכשיו לתכל׳ס. איך מתנהלים נכון ביום־יום ומממשים את הזכויות שלנו כעצמאים? קיפי צועד עם תרמיל.',
  },
  {
    id: 'income-documents', layout: 'approved-artwork', title: 'הפקת מסמכים על הכנסות',
    artwork: '/assets/self-employed-guide/income-documents-approved.png',
    artworkAlt: 'הפקת מסמכים על הכנסות. עוסק פטור: לפני התשלום חשבון עסקה, ובקבלת התשלום קבלה. עוסק מורשה: לפני התשלום חשבון עסקה, ובקבלת התשלום חשבונית מס־קבלה. מסלול צדדי: חשבונית מס ולאחריה קבלה.',
  },
  {
    id: 'expense-depreciation', layout: 'approved-artwork', title: 'שילמתם עכשיו. מתי ההוצאה מוכרת?',
    artwork: '/assets/self-employed-guide/expense-depreciation-approved.png',
    artworkAlt: 'שילמתם עכשיו. מתי ההוצאה מוכרת? לא כל הוצאה מוכרת בבת אחת. הוצאה שוטפת: פרסום לעסק ב-1,000 ₪ מוכר כהוצאה השנה. רכישה שמוכרת דרך פחת: מחשב לעסק ב-6,000 ₪, פחת שנתי 33%, הוצאה מוכרת של 1,980 ₪ בכל אחת משלוש השנים הראשונות ויתרה של 60 ₪ בשנה הרביעית. ההוצאה נפרסת. המע״מ לא.',
  },
  {
    id: 'pension', layout: 'approved-artwork', title: 'קרן פנסיה לעצמאים',
    artwork: '/assets/self-employed-guide/pension-approved.png',
    artworkAlt: 'קרן פנסיה לעצמאים. חובת הפקדה לפי ההכנסה למי שחלה עליו החובה. הטבות מס: ניכוי מקטין הכנסה חייבת וזיכוי מקטין את המס, בכפוף לתנאים ולתקרות. כיסוי לנכות ואובדן כושר עבודה וקצבה לשאירים במקרה פטירה בהתאם למסלול ולתנאי הקרן. חיסכון לקצבה חודשית בפרישה.',
  },
  {
    id: 'pension-tax-benefits', layout: 'approved-artwork', title: 'ניכוי וזיכוי — מה ההבדל?',
    artwork: '/assets/self-employed-guide/pension-tax-benefits-approved.png',
    artworkAlt: 'ניכוי מקטין את ההכנסה החייבת: 1,000 שקלים שהוכרו לניכוי מורידים הכנסה מ-250,000 ל-249,000. בדוגמת מס שולי של 31% החיסכון הוא 310 שקלים. זיכוי מקטין ישירות את המס: 1,000 שקלים שהוכרו לזיכוי מעניקים זיכוי של 35%, כלומר 350 שקלים. מס לתשלום של 10,000 יורד ל-9,650. אין מס לתשלום? אין מה לקזז.',
  },
  { id: 'study-comparison', layout: 'study-comparison', title: 'אותו חיסכון. כמה נשאר אצלכם?' },
  {
    id: 'study-fund', layout: 'approved-artwork', title: 'קרן השתלמות לעצמאים',
    artwork: '/assets/self-employed-guide/study-fund-approved.png',
    artworkAlt: 'קרן השתלמות לעצמאים. הטבה בהפקדה: הפקדה מוכרת מקטינה את ההכנסה החייבת במס. הטבה על הרווחים: פטור ממס על הרווחים עד תקרת ההפקדה המזכה. אחרי 6 שנים: אפשר למשוך לכל מטרה או להמשיך לחסוך.',
  },
  {
    id: 'expense-principle', layout: 'approved-artwork',
    title: 'מנצלים את כל ההוצאות שמגיעות לנו',
    artwork: '/assets/self-employed-guide/expense-principle-approved.png',
    artworkAlt: 'מנצלים את כל ההוצאות שמגיעות לנו. כל הוצאה מוכרת מקטינה את הרווח שעליו מחשבים מס. הוצאות מוכרות מובילות לפחות רווח חייב, פחות מס הכנסה ופחות ביטוח לאומי ובריאות כשיש חבות בתשלום. עוסק מורשה יכול גם לקזז מע״מ שמותר בניכוי. בעסק זעיר יש ניכוי קבוע של 30% מהמחזור במקום הוצאות בפועל.',
    sources: [{ label: 'קיזוז מס תשומות', url: 'https://www.gov.il/he/service/reporting-or-payment-of-vat-reports' }, { label: 'ניכוי במסלול עסק זעיר', url: figures.sources.microBusinessGuidance }],
  },
  { id: 'expense-savings', layout: 'expense-savings', title: 'כמה ההוצאה הזאת באמת שווה לכם?' },
  {
    id: 'product-pain', layout: 'approved-artwork', title: 'הסיוט של כל עצמאי',
    artwork: '/assets/self-employed-guide/product-pain-approved.png',
    artworkAlt: 'הסיוט של כל עצמאי. 1: איסוף המסמכים — לא יודעים מה נשכח בדרך. 2: שולחים לרואה החשבון — לא יודעים מה נקלט ומה נשאר בחוץ. 3: בסוף השנה מגיעה ההפתעה — הרווח עלה, המקדמות לא הותאמו, חוב למס הכנסה או לביטוח לאומי.',
  },
  {
    id: 'product-solution', layout: 'approved-artwork', title: 'הפתרון של KeepInTax',
    artwork: '/assets/self-employed-guide/product-solution-approved.png',
    artworkAlt: 'הפתרון של KeepInTax. 1: חיבור אוטומטי לתנועות ולמסמכים — בנק וכרטיסי אשראי ואיסוף מסמכים מהמייל, מ-Drive ומ-WhatsApp (בקרוב), מתנקזים למוח המערכת להתאמה בין תנועות למסמכים. 2: ממשק משותף לכם ולרואה החשבון — רואים מה הוגש ומה עדיין בטיפול. 3: מעקב אוטומטי אחרי הרווח השנתי — אין הפתעות בסוף שנה.',
  },
  {
    id: 'cover',
    layout: 'approved-artwork',
    title: 'אפשר גם אחרת',
    artwork: '/assets/self-employed-guide/cover-kipi-approved.png',
    artworkAlt: 'אפשר גם אחרת. עצמאי צעיר מוקף בניירת ובמס הכנסה, מע״מ וביטוח לאומי. קיפי ללא תרמיל עומד על אייקון KeepInTax ומצביע לכותרת.',
  },
  {
    id: 'basic-concepts',
    layout: 'approved-artwork',
    title: 'כמה מושגים בסיסיים לפני שיוצאים לדרך',
    artwork: '/assets/self-employed-guide/basic-concepts-kipi-approved.png',
    artworkAlt: 'קיפי עם תרמיל מנטה מציג מושגים בסיסיים: הכנסות / מחזור — כל ההכנסות מהעסק לפני שמקזזים הוצאות. מע״מ שגובים מלקוחות אינו חלק מההכנסה. הוצאות מוכרות — הוצאות לצורכי העסק שמותר לקזז לצורך חישוב המס. לפעמים רק חלק מההוצאה מוכר. רווח — ההכנסות מהעסק פחות ההוצאות של העסק. הכנסה חייבת — ההכנסה שעליה מחשבים מס, אחרי ההתאמות, הניכויים והפטורים שמגיעים לכם. משכורת (שכר ברוטו) — השכר כשכירים לפני שמקזזים מיסים, ביטוח לאומי והפרשות.',
  },
  {
    id: 'employee-payroll',
    layout: 'approved-artwork',
    title: 'כשאתם שכירים, המעסיק מטפל בהכל',
    artwork: '/assets/self-employed-guide/employee-payroll-approved.png',
    artworkAlt: 'כשאתם שכירים, המעסיק מטפל בהכל. מעסיק רציני מטפל במס הכנסה, ביטוח לאומי, פנסיה וקרן השתלמות. עובד מחויך מביט במחשב שעליו כתוב נטו 12,573 ₪, ומאחוריו לוח ספירה עד גיל 67.',
  },
  {
    id: 'business-types',
    layout: 'business-types',
    title: 'סוגי רישום העסקים בישראל',
    subtitle: 'ארבע הגדרות שכדאי להכיר לפני שמתחילים',
    items: [
      { label: 'בעל עסק זעיר', category: 'מסלול במס הכנסה', description: 'יכול להיות גם עוסק פטור וגם עוסק מורשה.', icon: 'leaf-outline' },
      { label: 'עוסק פטור', category: 'מעמד במע״מ', description: 'לא גובה מע״מ מהלקוחות.', icon: 'storefront-outline' },
      { label: 'עוסק מורשה', category: 'מעמד במע״מ', description: 'גובה מע״מ ומדווח עליו.', icon: 'receipt-outline' },
      { label: 'חברה', category: 'מבנה משפטי', description: 'ישות משפטית נפרדת מבעלי המניות.', icon: 'business-outline' },
    ],
    takeaway: 'בעל עסק זעיר הוא מסלול במס הכנסה. פטור ומורשה הם מעמד במע״מ.',
  },
  {
    id: 'tax-authorities',
    layout: 'authorities',
    title: 'על שלושה גופים העולם עומד',
    subtitle: 'בוחרים גוף ונכנסים לפרטים',
    items: [
      { label: 'מס הכנסה', category: 'הרווח', description: 'הפרק מוכן', icon: 'calculator-outline', targetSlideId: 'income-tax-overview', available: true },
      { label: 'מע״מ', category: 'העסקאות', description: 'הפרק מוכן', icon: 'receipt-outline', targetSlideId: 'vat-introduction', available: true },
      { label: 'ביטוח לאומי', category: 'ההכנסה והמעמד', description: 'מעמד ומחשבון', icon: 'people-outline', targetSlideId: 'ni-status', available: true },
    ],
  },
  {
    id: 'income-tax-overview',
    layout: 'income-overview',
    title: 'החובות של כל עסק',
    subtitle: 'מס הכנסה, מע״מ וביטוח לאומי',
    items: [
      { label: 'בעל עסק זעיר', category: 'המסלול המקוצר', description: 'מס הכנסה: תיאום מס ודיווח שנתי מקוצר (ניכוי 30% הוצאות). מע״מ: לפי הסיווג, פטור או מורשה. ביטוח לאומי: דיווח ותשלום לפי המעמד וההכנסה.', icon: 'flash-outline' },
      { label: 'עוסק פטור', category: 'במסלול הרגיל', description: 'מס הכנסה: מקדמות ודוח שנתי. מע״מ: הצהרת עוסק פטור אחת לשנה. ביטוח לאומי: דיווח ותשלום לפי המעמד וההכנסה.', icon: 'document-text-outline' },
      { label: 'עוסק מורשה', category: 'במסלול הרגיל', description: 'מס הכנסה: מקדמות ודוח שנתי. מע״מ: דיווח תקופתי למע״מ. ביטוח לאומי: דיווח ותשלום לפי המעמד וההכנסה.', icon: 'document-text-outline' },
    ],
    takeaway: 'המעמד במע״מ לא קובע לבדו איך מדווחים למס הכנסה.',
    sources: [{ label: 'הנחיות רשות המסים', url: figures.sources.microBusinessGuidance }],
  },
  {
    id: 'status-comparison',
    layout: 'status-comparison',
    title: 'מי יכול להיות פטור, ומי זעיר?',
    subtitle: `התקרה לשנת ${figures.taxYear}: ${ceiling} ₪ מחזור בשנה`,
    items: [
      { label: 'עוסק פטור', category: 'מע״מ', description: 'המחזור עד התקרה והעיסוק אינו מקצוע שחייב עוסק מורשה.', icon: 'storefront-outline' },
      { label: 'בעל עסק זעיר', category: 'מס הכנסה', description: 'עוסק פטור או מורשה שעומד בתנאי המסלול.', icon: 'analytics-outline' },
    ],
    takeaway: `הסכום נכון לשנת ${figures.taxYear}`,
    sources: [
      { label: 'עוסק פטור', url: figures.sources.vatExemptCeiling },
      { label: 'בעל עסק זעיר', url: figures.sources.microBusiness },
    ],
  },
  {
    id: 'micro-blockers',
    layout: 'micro-blockers',
    title: 'לא כל עסק קטן נכנס למסלול הזעיר',
    subtitle: 'המצבים העיקריים שחוסמים את הכניסה',
    items: [
      { label: 'העסק מעסיק עובדים', description: 'המסלול הזעיר לא מתאים', icon: 'people-outline' },
      { label: 'חבר קיבוץ', description: 'תיאום המס נעשה מול פקיד השומה', icon: 'home-outline' },
      { label: 'הכנסה מהמעסיק', description: 'עלולה לחסום את המסלול', icon: 'briefcase-outline' },
      { label: 'יותר מ־25% מקרוב או ממעסיק קודם', description: 'המסלול הזעיר לא מתאים', icon: 'git-network-outline' },
      { label: 'בעל שליטה בחברה', description: 'המסלול הזעיר לא מתאים', icon: 'business-outline' },
    ],
    takeaway: 'קיימים חריגים נוספים, לכן בודקים התאמה לפני שנרשמים.',
    sources: [
      { label: 'תנאי המסלול', url: figures.sources.microBusinessGuidance },
      { label: 'תיאום מס', url: figures.sources.taxCoordination },
    ],
  },
  {
    id: 'income-combination',
    layout: 'income-combination',
    title: 'שכיר וגם עצמאי? בסוף שנה הכל נפגש',
    items: [
      { label: 'משכורת שנתית', description: 'ההכנסה כשכיר', icon: 'person-outline' },
      { label: 'רווח מהעסק', category: 'הכנסות פחות הוצאות', description: 'ההכנסה החייבת מהעסק', icon: 'storefront-outline' },
    ],
    takeaway: 'המס מחושב על המשכורת והרווח מהעסק יחד.',
    sources: [{ label: 'תיאום מס מקוון', url: figures.sources.taxCoordination }],
  },
  {
    id: 'tax-simulator',
    layout: 'tax-simulator',
    title: 'חשבון לכיתה ד - אין מה לחשוש',
    sources: [{ label: 'מדרגות מס 2026', url: figures.sources.incomeTax2026 }],
  },
  {
    id: 'advances-introduction', layout: 'approved-artwork',
    title: 'מה זה בעצם מקדמות?',
    artwork: '/assets/self-employed-guide/advances-introduction-approved.png',
    artworkAlt: 'שכירים: המס יורד מהשכר בכל תלוש. עצמאים: הרווח משתנה והמס הסופי עוד לא ידוע. מקדמות הן תשלומים על חשבון המס השנתי. בסוף השנה משלימים או מקבלים החזר.',
  },
  {
    id: 'advances-calculation', layout: 'approved-artwork',
    title: 'איך נקבעות המקדמות?',
    artwork: '/assets/self-employed-guide/advances-calculation-approved.png',
    artworkAlt: 'מס הכנסה קובע מקדמות כאחוז מהמחזור או כסכום. דוגמה לפי אחוזים: מחזור של 20,000 ₪ כפול 5% נותן מקדמה של 1,000 ₪. שינוי מהותי בעסק? אפשר לבקש עדכון מקדמות במהלך השנה. המקדמות הן על חשבון המס. המס הסופי לפי ההכנסה החייבת.',
    sources: [{ label: 'שיטות חישוב המקדמות', url: 'https://www.gov.il/files/taxes/KnowYourRights2018/files/basic-html/page179.html' }],
  },
  {
    id: 'advances-payment', layout: 'approved-artwork',
    title: 'איך מדווחים ומשלמים את המקדמות?',
    artwork: '/assets/self-employed-guide/advances-payment-approved.png',
    artworkAlt: 'אחת לחודש או לחודשיים לפי הדרישה בתיק: מרכזים מחזור ללא מע״מ, מחשבים לפי הדרישה ומקזזים ניכוי במקור שמותר לקזז, מדווחים ומשלמים באתר רשות המסים לבד או דרך המייצג. שתי הערות בתחתית: ניכוי מס במקור — הלקוח העביר חלק מהתשלום למס הכנסה על חשבונכם; שומרים אישור ומקזזים מהמקדמה את הניכוי המותר. בעל עסק זעיר במסלול המקוצר — עושים תיאום מס במהלך השנה גם ללא שכר, וכוללים שכר נוסף אם יש; אחרי השנה דיווח מקוצר ותשלום, עם 30% מהמחזור כהוצאות במקום הוצאות בפועל. אין חובת מקדמות במסלול המקוצר; אפשר לשלם במהלך השנה.',
    sources: [
      { label: 'דיווח ותשלום מקדמות', url: 'https://www.gov.il/he/service/itc-payment-online-incometax' },
      { label: 'דיווח מקוצר', url: 'https://www.gov.il/he/service/report-and-payment-for-micro-business-owner' },
      { label: 'מקדמות לעסק זעיר', url: 'https://www.gov.il/he/service/request-down-payment-for-micro-business-owner' },
    ],
  },
  {
    id: 'vat-introduction', layout: 'approved-artwork', title: 'מע״מ — לא כל הכסף שנכנס הוא שלכם',
    artwork: '/assets/self-employed-guide/vat-introduction-approved.png',
    artworkAlt: 'עוסק מורשה גובה מע״מ על עסקאות חייבות, מקזז מס תשומות מותר ומדווח על ההפרש. עוסק פטור לא גובה מע״מ בעסקאותיו הרגילות ולא מקזז תשומות. מע״מ אינו מס על הרווח אלא על ביצוע עסקאות.',
    sources: [{ label: 'דיווח מע״מ', url: 'https://www.gov.il/he/service/reporting-or-payment-of-vat-reports' }],
  },
  {
    id: 'vat-calculation', layout: 'approved-artwork', title: 'אז כמה מע״מ משלמים?',
    artwork: '/assets/self-employed-guide/vat-calculation-approved.png',
    artworkAlt: 'דוגמה ב־18%: עסקאות לפני מע״מ 10,000 ₪, מס עסקאות 1,800 ₪, הוצאות לפני מע״מ 2,000 ₪, מס תשומות מותר 360 ₪, לתשלום 1,440 ₪. בדוגמה כל מס התשומות מותר בקיזוז כנגד חשבוניות מס תקינות.',
  },
  {
    id: 'ni-status', layout: 'approved-artwork', title: 'עצמאי — אבל איזה?',
    artwork: '/assets/self-employed-guide/ni-status-approved.png',
    artworkAlt: 'עצמאי שעונה להגדרה: לפחות 20 שעות בשבוע, או הכנסה חודשית ממוצעת של 6,885 ₪, או לפחות 12 שעות בשבוע והכנסה ממוצעת של 2,065 ₪. מי שאינו עומד באף תנאי אינו עונה להגדרה. נתוני 2026.',
    sources: [{ label: 'הגדרת עצמאי', url: 'https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/default.aspx' }],
  },
  {
    id: 'ni-payment', layout: 'approved-artwork', title: 'אז מי חייב לשלם?',
    artwork: '/assets/self-employed-guide/ni-payment-approved.png',
    artworkAlt: 'עצמאי שעונה להגדרה משלם לפי ההכנסה החייבת מהעסק. מי שאינו עונה להגדרה: עד סכום הפטור לא משלמים על הכנסה מהעסק; מעליו משלמים על ההפרש. ייתכן תשלום מינימום גם כשההכנסה פטורה.',
  },
  {
    id: 'ni-rates', layout: 'ni-rates', title: 'כמה משלמים באחוזים?',
    sources: [
      { label: 'שיעורי דמי ביטוח לעצמאי', url: 'https://www.btl.gov.il/insurance/national%20insurance/type_list/self_employed/pages/rates.aspx' },
      { label: 'שיעורי הכנסה שלא מעבודה', url: 'https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/Notworking.aspx' },
    ],
  },
  { id: 'ni-calculator', layout: 'ni-simulator', title: 'אז כמה משלמים?' },
];

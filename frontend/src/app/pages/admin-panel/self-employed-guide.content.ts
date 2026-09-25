import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

export type GuideSlideLayout =
  | 'cover'
  | 'business-types'
  | 'authorities'
  | 'income-overview'
  | 'status-comparison'
  | 'micro-blockers'
  | 'income-combination'
  | 'approved-artwork'
  | 'ni-simulator'
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
    id: 'expense-principle', layout: 'expense-principle',
    title: 'כבר שילמתם? אל תפספסו את החיסכון.',
    sources: [{ label: 'קיזוז מס תשומות', url: 'https://www.gov.il/he/service/reporting-or-payment-of-vat-reports' }, { label: 'ניכוי במסלול עסק זעיר', url: figures.sources.microBusinessGuidance }],
  },
  { id: 'expense-savings', layout: 'expense-savings', title: 'כמה ההוצאה הזאת באמת עולה לכם?' },
  {
    id: 'product-pain', layout: 'approved-artwork', title: 'הסיוט של כל עצמאי',
    artwork: '/assets/self-employed-guide/product-pain-approved.png',
    artworkAlt: 'הסיוט של כל עצמאי. 1: איסוף המסמכים — לא יודעים מה נשכח בדרך. 2: שולחים לרואה החשבון — לא יודעים מה נקלט ומה נשאר בחוץ. 3: בסוף השנה מגיעה ההפתעה — הרווח עלה, המקדמות לא הותאמו, חוב למס הכנסה או לביטוח לאומי.',
  },
  {
    id: 'product-solution', layout: 'approved-artwork', title: 'הפתרון של KeepInTax',
    artwork: '/assets/self-employed-guide/product-solution-approved.png',
    artworkAlt: 'הפתרון של KeepInTax. 1: חיבור ישיר לבנק ולכרטיסים — כל התנועות במקום אחד. 2: ממשק משותף — בכל רגע יודעים מה הוגש ומה עדיין בטיפול. 3: מעקב אוטומטי אחרי הרווח השנתי.',
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
    artworkAlt: 'מס הכנסה קובע מקדמות כאחוז מהמחזור או כסכום. דוגמה לפי אחוזים: מחזור ללא מע״מ של 20,000 ₪ כפול 5% נותן מקדמה של 1,000 ₪. המספרים להמחשה בלבד. המס הסופי לפי ההכנסה החייבת.',
    sources: [{ label: 'שיטות חישוב המקדמות', url: 'https://www.gov.il/files/taxes/KnowYourRights2018/files/basic-html/page179.html' }],
  },
  {
    id: 'advances-adjustment', layout: 'approved-artwork',
    title: 'העסק השתנה? בודקים גם את המקדמות',
    artwork: '/assets/self-employed-guide/advances-adjustment-approved.png',
    artworkAlt: 'הרווח עלה? ייתכן שהמקדמות לא יספיקו. הרווח ירד? ייתכן שאתם משלמים יותר מדי. אפשר לבקש שינוי לפי תחזית מעודכנת. לא משנים את התשלום על דעת עצמנו.',
    sources: [{ label: 'בקשה להקטנת מקדמות', url: 'https://www.gov.il/he/service/itc-2216a' }],
  },
  {
    id: 'advances-payment', layout: 'approved-artwork',
    title: 'איך מדווחים ומשלמים את המקדמות?',
    artwork: '/assets/self-employed-guide/advances-payment-approved.png',
    artworkAlt: 'אחת לחודש או לחודשיים לפי הדרישה בתיק: מרכזים מחזור ללא מע״מ, מחשבים לפי הדרישה ומקזזים ניכוי במקור שמותר לקזז, מדווחים ומשלמים באתר רשות המסים לבד או דרך המייצג. ניכוי במקור הוא תשלום שהלקוח העביר למס הכנסה על חשבונכם. שומרים את האישור.',
    sources: [{ label: 'דיווח ותשלום מקדמות', url: 'https://www.gov.il/he/service/itc-payment-online-incometax' }],
  },
  {
    id: 'micro-reporting', layout: 'approved-artwork',
    title: 'עסק זעיר? יש מסלול מקוצר',
    artwork: '/assets/self-employed-guide/micro-reporting-approved.png',
    artworkAlt: 'למי שעומד בתנאי המסלול המקוצר: במהלך השנה עושים תיאום מס, גם אם יש רק הכנסה מהעסק, וכוללים שכר אם יש. אחרי השנה מגישים דיווח מקוצר ומשלמים מס. 30% מהמחזור כהוצאות במקום ההוצאות בפועל. אין חובת מקדמות במסלול המקוצר; אפשר לשלם במהלך השנה.',
    sources: [
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
  { id: 'ni-calculator', layout: 'ni-simulator', title: 'אז כמה משלמים?' },
];

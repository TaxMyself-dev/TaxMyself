import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

export type GuideSlideLayout =
  | 'cover'
  | 'business-types'
  | 'authorities'
  | 'income-overview'
  | 'status-comparison'
  | 'micro-blockers'
  | 'income-combination'
  | 'tax-simulator';

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
}

const figures = SELF_EMPLOYED_GUIDE_FIGURES;
const ceiling = new Intl.NumberFormat('he-IL').format(figures.vatExemptTurnoverCeiling);

export const SELF_EMPLOYED_GUIDE_SLIDES: GuideSlide[] = [
  {
    id: 'cover',
    layout: 'cover',
    title: 'אפשר גם אחרת',
    subtitle: 'הדברים שכל עצמאי צריך לדעת, בלי ללכת לאיבוד בניירת.',
  },
  {
    id: 'business-types',
    layout: 'business-types',
    title: 'כל השבילים מובילים למס הכנסה',
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
      { label: 'מע״מ', category: 'העסקאות', description: 'נוסיף בהמשך', icon: 'receipt-outline', available: false },
      { label: 'ביטוח לאומי', category: 'ההכנסה והמעמד', description: 'נוסיף בהמשך', icon: 'people-outline', available: false },
    ],
  },
  {
    id: 'income-tax-overview',
    layout: 'income-overview',
    title: 'מס הכנסה מתעניין ברווח',
    subtitle: 'אותו מס, שתי דרכי דיווח',
    items: [
      { label: 'בעל עסק זעיר', category: 'המסלול המקוצר', description: 'תיאום מס ודיווח שנתי מקוצר', icon: 'flash-outline' },
      { label: 'עוסק פטור', category: 'במסלול הרגיל', description: 'מקדמות ודוח שנתי', icon: 'document-text-outline' },
      { label: 'עוסק מורשה', category: 'במסלול הרגיל', description: 'מקדמות ודוח שנתי', icon: 'document-text-outline' },
    ],
    takeaway: 'המעמד במע״מ לא קובע לבדו איך מדווחים למס הכנסה.',
    sources: [{ label: 'הנחיות רשות המסים', url: figures.sources.microBusinessGuidance }],
  },
  {
    id: 'status-comparison',
    layout: 'status-comparison',
    title: 'פטור וזעיר: דומים, אבל לא תאומים',
    subtitle: `התקרה לשנת ${figures.taxYear}: ${ceiling} ₪ מחזור בשנה`,
    items: [
      { label: 'עוסק פטור', category: 'מע״מ', description: 'המחזור עד התקרה והעיסוק אינו מקצוע שחייב עוסק מורשה.', icon: 'storefront-outline' },
      { label: 'בעל עסק זעיר', category: 'מס הכנסה', description: 'עוסק פטור או מורשה שעומד בתנאי המסלול.', icon: 'analytics-outline' },
    ],
    takeaway: 'אפשר להיות גם וגם. גם בעל מקצוע חופשי יכול להיות בעל עסק זעיר.',
    sources: [
      { label: 'עוסק פטור', url: figures.sources.vatExemptCeiling },
      { label: 'בעל עסק זעיר', url: figures.sources.microBusiness },
    ],
  },
  {
    id: 'micro-blockers',
    layout: 'micro-blockers',
    title: 'לא כל עסק קטן עובר ישר במסלול הזעיר',
    subtitle: 'יש תנאי זכאות ויש מקרים שמצריכים טיפול ידני',
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
    title: 'שכיר וגם עצמאי? בסוף הכול נפגש',
    subtitle: 'מס הכנסה מסתכל על התמונה השנתית המלאה',
    items: [
      { label: 'משכורת שנתית', description: 'ההכנסה כשכיר', icon: 'person-outline' },
      { label: 'רווח מהעסק', category: 'הכנסות פחות הוצאות', description: 'ההכנסה החייבת מהעסק', icon: 'storefront-outline' },
    ],
    takeaway: 'המס מחושב על המשכורת והרווח מהעסק יחד, לפי מדרגות המס ונקודות הזיכוי.',
    sources: [{ label: 'תיאום מס מקוון', url: figures.sources.taxCoordination }],
  },
  {
    id: 'tax-simulator',
    layout: 'tax-simulator',
    title: 'חשבון לכיתה ד - אין מה לחשוש',
    sources: [{ label: 'מדרגות מס 2026', url: figures.sources.incomeTax2026 }],
  },
];

import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';

export interface GuideItem {
  label: string;
  description: string;
}

export interface GuideSlide {
  id: string;
  layout: 'cover' | 'numbers' | 'definitions';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items?: GuideItem[];
  takeaway?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

const formatShekels = (amount: number): string =>
  `${new Intl.NumberFormat('he-IL').format(amount)} ₪`;

export const SELF_EMPLOYED_GUIDE_SLIDES: GuideSlide[] = [
  {
    id: 'cover',
    layout: 'cover',
    eyebrow: 'הדרכה לעצמאים',
    title: 'כסף, מסים ומסמכים',
    subtitle: 'הדברים הבסיסיים שכל עצמאי צריך לדעת',
  },
  {
    id: 'business-numbers',
    layout: 'numbers',
    eyebrow: 'תמונת מצב',
    title: 'ארבעה מספרים שצריך להכיר',
    items: [
      { label: 'הכנסות', description: 'כמה העסק הכניס' },
      { label: 'הוצאות', description: 'כמה עלה להפעיל אותו' },
      { label: 'רווח', description: 'מה נשאר אחרי ההוצאות' },
      { label: 'כסף זמין', description: 'מה באמת פנוי לתשלום' },
    ],
    takeaway: 'מכירות לבדן לא מספרות מה מצב העסק',
  },
  {
    id: 'business-definitions',
    layout: 'definitions',
    eyebrow: 'הבסיס',
    title: 'שלוש הגדרות שונות לעסק',
    items: [
      {
        label: 'מעמד במע״מ',
        description: 'עוסק פטור או עוסק מורשה. המעמד קובע בעיקר את אופן ההתנהלות מול מע״מ.',
      },
      {
        label: 'מסלול במס הכנסה',
        description: 'מסלול רגיל או, למי שעומד בתנאים, מסלול בעל עסק זעיר.',
      },
      {
        label: 'צורת התאגדות',
        description: 'עסק של יחיד, שותפות או חברה.',
      },
    ],
    takeaway: `עוסק פטור פטור ממע״מ בלבד. בשנת ${SELF_EMPLOYED_GUIDE_FIGURES.taxYear} תקרת המחזור היא ${formatShekels(SELF_EMPLOYED_GUIDE_FIGURES.vatExemptTurnoverCeiling)}, בכפוף לעיסוק ולתנאים.`,
    sourceLabel: `רשות המסים · נבדק ${SELF_EMPLOYED_GUIDE_FIGURES.lastReviewed}`,
    sourceUrl: SELF_EMPLOYED_GUIDE_FIGURES.vatExemptSourceUrl,
  },
];

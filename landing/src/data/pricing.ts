export interface PricingFeature {
  label: string;
  included: boolean;
}

/** One displayed row: amount + ₪ (U+20AA) + suffix on the same line */
export interface PricingPriceLine {
  amount: string;
  suffix: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  subtitle: string;
  priceLines: PricingPriceLine[];
  featured: boolean;
  featuredLabel?: string;
  features: PricingFeature[];
  /** Small caption shown above the VAT disclaimer (used for asterisk explanations). */
  footnote?: string;
}

// Array order = RTL visual order: first item → rightmost column on desktop
export const pricingPlans: PricingPlan[] = [
  {
    id: 'lite',
    name: 'בקטנה',
    subtitle: 'תוכנית בסיסית למתחילים',
    priceLines: [{ amount: '18', suffix: '/לחודש' }],
    featured: false,
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'ניהול הוצאות', included: true },
      { label: 'סנכרון לחשבונות הבנק', included: false },
      { label: 'צ׳אט תמיכה לשאלות מקצועיות', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'עצמאי בעצמי',
    subtitle: 'תוכנית לניהול עצמי',
    priceLines: [
      { amount: '49', suffix: '/לחודש לעוסק פטור' },
      { amount: '159', suffix: '/לחודש לעוסק מורשה' },
    ],
    featured: true,
    featuredLabel: 'מומלץ!',
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'ניהול הוצאות', included: true },
      { label: 'סנכרון לחשבונות הבנק', included: true },
      { label: 'צ׳אט תמיכה לשאלות מקצועיות', included: true },
    ],
    footnote: '*הגשת דוח שנתי דרכנו בעלות של 500 ש״ח (לעסק ללא מורכבויות נוספות)',
  },
  {
    id: 'pro',
    name: 'ליווי מלא',
    subtitle: 'תוכנית לעסקים מקצועיים',
    priceLines: [
      { amount: '179', suffix: '/לחודש לעוסק פטור' },
      { amount: '480', suffix: '/לחודש לעוסק מורשה' },
    ],
    featured: false,
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'ניהול הוצאות', included: true },
      { label: 'סנכרון לחשבונות הבנק', included: true },
      { label: 'ייצוג על ידי רואה חשבון', included: true },
    ],
  },
];

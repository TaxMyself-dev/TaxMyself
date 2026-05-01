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
}

// Array order = RTL visual order: first item → rightmost column on desktop
export const pricingPlans: PricingPlan[] = [
  {
    id: 'lite',
    name: 'לייט',
    subtitle: 'תוכנית בסיסית למתחילים',
    priceLines: [{ amount: '18', suffix: '/לחודש' }],
    featured: false,
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'סנכרון בין החשבונות', included: false },
      { label: 'ייצוג על ידי רואה חשבון', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'בייסיק',
    subtitle: 'תוכנית לניהול עצמי',
    priceLines: [{ amount: '45', suffix: '/לחודש' }],
    featured: true,
    featuredLabel: 'מומלץ!',
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'סנכרון בין החשבונות', included: true },
      { label: 'ייצוג על ידי רואה חשבון', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'פרו',
    subtitle: 'תוכנית לעסקים מקצועיים',
    priceLines: [
      { amount: '195', suffix: '/לחודש לעוסק פטור' },
      { amount: '475', suffix: '/לחודש לא כולל מע״מ לעוסק מורשה' },
    ],
    featured: false,
    features: [
      { label: 'הפקת מסמכים', included: true },
      { label: 'סנכרון בין החשבונות', included: true },
      { label: 'ייצוג על ידי רואה חשבון', included: true },
    ],
  },
];

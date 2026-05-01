export interface PricingFeature {
  label: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  subtitle: string;
  price: string;
  priceSuffix: string;
  priceNote?: string;
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
    price: '18',
    priceSuffix: '₪/לחודש',
    featured: false,
    features: [
      { label: 'הפקת מסמכים',            included: true  },
      { label: 'סנכרון בין החשבונות',     included: false },
      { label: 'ייצוג על ידי רואה חשבון', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'בייסיק',
    subtitle: 'תוכנית לניהול עצמי',
    price: '45',
    priceSuffix: '₪/לחודש',
    featured: true,
    featuredLabel: 'מומלץ!',
    features: [
      { label: 'הפקת מסמכים',            included: true  },
      { label: 'סנכרון בין החשבונות',     included: true  },
      { label: 'ייצוג על ידי רואה חשבון', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'פרו',
    subtitle: 'תוכנית לעסקים מקצועיים',
    price: '195',
    priceSuffix: '₪/לחודש לעוסק פטור',
    priceNote: '475₪/לחודש לא כולל מע״מ לעוסק מורשה',
    featured: false,
    features: [
      { label: 'הפקת מסמכים',            included: true },
      { label: 'סנכרון בין החשבונות',     included: true },
      { label: 'ייצוג על ידי רואה חשבון', included: true },
    ],
  },
];

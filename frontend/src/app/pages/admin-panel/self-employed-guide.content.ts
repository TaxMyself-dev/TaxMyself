export interface GuideItem {
  label: string;
  description: string;
  category?: string;
}

export interface GuideSource {
  label: string;
  url: string;
}

export interface GuideObligation {
  businessType: string;
  incomeTax: string;
  vat: string;
  nationalInsurance: string;
}

export interface GuideSlide {
  id: string;
  layout: 'cover' | 'business-types' | 'authorities' | 'obligations';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items?: GuideItem[];
  obligations?: GuideObligation[];
  takeaway?: string;
  sources?: GuideSource[];
}

export const SELF_EMPLOYED_GUIDE_SLIDES: GuideSlide[] = [
  {
    id: 'cover',
    layout: 'cover',
    eyebrow: 'הדרכה לעצמאים',
    title: 'עצמאים, עושים סדר',
    subtitle: 'סוגי העסקים, רשויות המס ומה כל אחת צריכה מכם',
  },
  {
    id: 'business-types',
    layout: 'business-types',
    eyebrow: 'מתחילים בהגדרות',
    title: 'ארבע הגדרות שכדאי להכיר',
    items: [
      {
        label: 'בעל עסק זעיר',
        category: 'מסלול במס הכנסה',
        description: 'מסלול דיווח פשוט יותר למי שעומד בתנאים.',
      },
      {
        label: 'עוסק פטור',
        category: 'מעמד במע״מ',
        description: 'לא גובה מע״מ מהלקוחות ומדווח למע״מ פעם בשנה.',
      },
      {
        label: 'עוסק מורשה',
        category: 'מעמד במע״מ',
        description: 'גובה מע״מ ומגיש דוחות מע״מ תקופתיים.',
      },
      {
        label: 'חברה',
        category: 'מבנה משפטי',
        description: 'ישות נפרדת מבעלי המניות. בהמשך נתמקד בעסק של יחיד.',
      },
    ],
    takeaway: 'עסק זעיר יכול להיות גם עוסק פטור וגם עוסק מורשה — אלה הגדרות ממערכות שונות.',
    sources: [
      { label: 'רשות המסים · בעל עסק זעיר', url: 'https://www.gov.il/he/pages/sa190125-1' },
    ],
  },
  {
    id: 'tax-authorities',
    layout: 'authorities',
    eyebrow: 'מפת הרשויות',
    title: 'שלוש רשויות, שלושה תפקידים',
    items: [
      { label: 'מס הכנסה', category: 'הרווח', description: 'מחשב מס לפי ההכנסה החייבת שלכם.' },
      { label: 'מע״מ', category: 'העסקאות', description: 'מטפל במס הערך המוסף על מכירות ורכישות.' },
      { label: 'ביטוח לאומי', category: 'ביטוח וזכויות', description: 'גובה דמי ביטוח לפי המעמד וההכנסה.' },
    ],
    takeaway: 'אותו עסק — שלוש התחשבנויות נפרדות.',
  },
  {
    id: 'obligations-map',
    layout: 'obligations',
    eyebrow: 'מבט־על',
    title: 'מי צריך מכם מה?',
    subtitle: 'החובות המרכזיות לפני שנצלול למספרים ולדוגמאות',
    obligations: [
      {
        businessType: 'בעל עסק זעיר (פטור או מורשה)',
        incomeTax: 'תיאום מס ודיווח שנתי מקוצר',
        vat: 'לפי המעמד: פטור או מורשה',
        nationalInsurance: 'רישום ותשלום מקדמות',
      },
      {
        businessType: 'עוסק פטור במסלול הרגיל',
        incomeTax: 'מקדמות לפי קביעה ודוח שנתי',
        vat: 'הצהרת מחזור שנתית, בלי גביית מע״מ',
        nationalInsurance: 'רישום ותשלום מקדמות',
      },
      {
        businessType: 'עוסק מורשה במסלול הרגיל',
        incomeTax: 'מקדמות לפי קביעה ודוח שנתי',
        vat: 'דוחות תקופתיים ותשלום מע״מ',
        nationalInsurance: 'רישום ותשלום מקדמות',
      },
    ],
    takeaway: 'זו מפת התמצאות. החובות המדויקות משתנות לפי נתוני העסק והאדם.',
    sources: [
      { label: 'מס הכנסה · עסק זעיר', url: 'https://www.gov.il/he/pages/sa190125-1' },
      { label: 'מע״מ · עוסק פטור', url: 'https://www.gov.il/he/service/vat-declarationisexempt' },
      { label: 'מע״מ · דיווח תקופתי', url: 'https://www.gov.il/he/service/reporting-and-paying-taxes' },
      { label: 'ביטוח לאומי · מקדמות עצמאי', url: 'https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/tikun.aspx' },
    ],
  },
];

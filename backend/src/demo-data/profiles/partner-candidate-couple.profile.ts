import {
  BusinessFieldType,
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
  UserRole,
} from 'src/enum';
import { DemoProfile, DemoTransactionTemplate } from '../demo-profile.types';

const SHANI_ID = '327451803';
const OMER_ID = '318764206';

const SHANI_BANK = '87451209';
const OMER_BANK = '62018473';
const SHANI_VISA = '1842';
const SHANI_MASTERCARD = '7316';
const OMER_CARD = '4095';
const DEMO_CONSENT = 'partner-candidate-couple-consent';

const SHANI_BANK_BILL = 'shani-bank';
const OMER_BANK_BILL = 'omer-bank';
const SHANI_VISA_BILL = 'shani-visa';
const SHANI_MASTERCARD_BILL = 'shani-mastercard';
const OMER_CARD_BILL = 'omer-card';

const tx = (
  billKey: string,
  businessNumberRef: string,
  merchantName: string,
  amount: number,
  transactionDate: string,
  currency: DemoTransactionTemplate['currency'] = 'ILS',
): DemoTransactionTemplate => ({
  billKey,
  businessNumberRef,
  merchantName,
  amount,
  transactionDate,
  currency,
});

/**
 * Safe, synthetic account for a prospective partner to explore the product.
 * Dates are fixed so future resets keep the requested January-2026 history.
 */
export const PARTNER_CANDIDATE_COUPLE_PROFILE: DemoProfile = {
  id: 'partner-candidate-couple',
  label: 'שני ועומר - סביבת היכרות לשותפה',
  description:
    'משתמשת רגילה בלבד: שני עם עוסק מורשה ועומר עם עוסק פטור. שני חשבונות בנק, שלושה כרטיסי אשראי ונתונים סינתטיים מגוונים מינואר 2026.',
  email: 'shani-partner-demo@keepintax.co.il',
  password: 'PartnerDemo!2026',
  syntheticOpenBanking: true,
  role: [UserRole.REGULAR],
  hasOpenBanking: true,

  user: {
    fName: 'שני',
    lName: 'לוי',
    id: SHANI_ID,
    phone: '0504518032',
    gender: Gender.FEMALE,
    dateOfBirth: '1988-06-14',
    city: 'רמת גן',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.MARRIED,
  },

  spouse: {
    fName: 'עומר',
    lName: 'לוי',
    id: OMER_ID,
    phone: '0527642063',
    email: 'omer.partner-demo@keepintax.co.il',
    gender: Gender.MALE,
    dateOfBirth: '1986-11-03',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
  },

  businesses: [
    {
      businessName: 'שני לוי - סטודיו למיתוג',
      businessNumber: SHANI_ID,
      businessType: BusinessType.LICENSED,
      businessField: BusinessFieldType.SERVICE_PROVIDER,
      businessAddress: 'רמת גן',
      advanceTaxPercent: 8,
    },
    {
      businessName: 'עומר לוי - תיקונים והתקנות',
      businessNumber: OMER_ID,
      businessType: BusinessType.EXEMPT,
      businessField: BusinessFieldType.SERVICE_PROVIDER,
      businessAddress: 'רמת גן',
      advanceTaxPercent: 4,
    },
  ],

  bills: [
    {
      key: SHANI_BANK_BILL,
      billName: 'חשבון עסקי הפועלים - שני',
      businessNumberRef: SHANI_ID,
      sources: [{ sourceName: SHANI_BANK, sourceType: SourceType.BANK_ACCOUNT, connectionRole: 'primary' }],
    },
    {
      key: OMER_BANK_BILL,
      billName: 'חשבון עסקי לאומי - עומר',
      businessNumberRef: OMER_ID,
      sources: [{ sourceName: OMER_BANK, sourceType: SourceType.BANK_ACCOUNT, connectionRole: 'spouse' }],
    },
    {
      key: SHANI_VISA_BILL,
      billName: 'ויזה עסקי 1842 - שני',
      businessNumberRef: SHANI_ID,
      sources: [{ sourceName: SHANI_VISA, sourceType: SourceType.CREDIT_CARD, connectionRole: 'primary', isDirect: false }],
    },
    {
      key: SHANI_MASTERCARD_BILL,
      billName: 'מאסטרקארד 7316 - שני',
      businessNumberRef: SHANI_ID,
      sources: [{ sourceName: SHANI_MASTERCARD, sourceType: SourceType.CREDIT_CARD, connectionRole: 'primary', isDirect: false }],
    },
    {
      key: OMER_CARD_BILL,
      billName: 'ישראכרט 4095 - עומר',
      businessNumberRef: OMER_ID,
      sources: [{ sourceName: OMER_CARD, sourceType: SourceType.CREDIT_CARD, connectionRole: 'spouse', isDirect: false }],
    },
  ],

  transactions: [
    // Shani bank: recurring client income, rent, taxes, fees, and household transfers.
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - קבוצת אוריון', 14820, '2026-01-08'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'שכירות סטודיו', -5200, '2026-01-10'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - מסעדת נונה', 6840, '2026-02-05'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'מקדמות מס הכנסה', -1800, '2026-02-15'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - חברת אטלס', 22360, '2026-03-03'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'שכירות סטודיו', -5200, '2026-03-10'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'תשלום מע״מ דו-חודשי', -7360, '2026-03-18'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - קליניקת אביב', 9360, '2026-04-07'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'הפקדת מזומן', 1850, '2026-04-22'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - קבוצת אוריון', 17550, '2026-05-06'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'תשלום מע״מ דו-חודשי', -6480, '2026-05-18'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - מלון החוף', 11200, '2026-06-04'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'שכירות סטודיו', -5200, '2026-06-10'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'החזר מספק - דפוס המרכז', 640, '2026-06-26'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - חברת אטלס', 19890, '2026-07-02'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'תשלום מע״מ דו-חודשי', -8120, '2026-07-19'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - פסטיבל העיר', 7600, '2026-08-09'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה לחשבון עומר', -2400, '2026-08-25'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - קבוצת אוריון', 15600, '2026-09-03'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'תשלום מע״מ דו-חודשי', -7020, '2026-09-17'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'העברה מלקוח - קפה הצפון', 5850, '2026-10-12'),
    tx(SHANI_BANK_BILL, SHANI_ID, 'עמלת ניהול חשבון', -32, '2026-10-15'),

    // Omer bank: exempt-dealer income, cash, insurance, National Insurance, and transfers.
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - משפחת כהן', 2450, '2026-01-12'),
    tx(OMER_BANK_BILL, OMER_ID, 'ביטוח לאומי', -640, '2026-01-20'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - ועד הבית הגפן', 3800, '2026-02-11'),
    tx(OMER_BANK_BILL, OMER_ID, 'הפקדת מזומן', 1200, '2026-02-24'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - משרד עורכי דין לב', 5200, '2026-03-14'),
    tx(OMER_BANK_BILL, OMER_ID, 'ביטוח אחריות מקצועית', -980, '2026-03-28'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - משפחת רז', 1850, '2026-04-16'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - בית קפה נורדאו', 4650, '2026-05-21'),
    tx(OMER_BANK_BILL, OMER_ID, 'ביטוח לאומי', -640, '2026-06-20'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - ועד הבית השקד', 6100, '2026-07-07'),
    tx(OMER_BANK_BILL, OMER_ID, 'העברה מחשבון שני', 2400, '2026-08-25'),
    tx(OMER_BANK_BILL, OMER_ID, 'רכיב הלוואה עסקית', -1450, '2026-09-01'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - משפחת ארז', 3250, '2026-09-22'),
    tx(OMER_BANK_BILL, OMER_ID, 'עמלת העברה מיידית', -18, '2026-10-02'),
    tx(OMER_BANK_BILL, OMER_ID, 'תשלום מלקוח - קליניקת לב העיר', 4400, '2026-10-16'),

    // Shani Visa: subscriptions, travel, fuel, equipment, foreign currency, and a refund.
    tx(SHANI_VISA_BILL, SHANI_ID, 'Adobe Creative Cloud', -59.99, '2026-01-04', 'USD'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Figma Professional', -15, '2026-02-04', 'USD'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'תחנת דלק פז', -386.4, '2026-02-18'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'KSP - מחשב נייד', -6890, '2026-03-12'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Dropbox Business', -180, '2026-04-04', 'USD'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'רכבת ישראל', -74, '2026-05-09'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Airbnb Berlin', -420, '2026-06-13', 'EUR'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'החזר Airbnb Berlin', 95, '2026-06-20', 'EUR'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'תחנת דלק סונול', -412.7, '2026-07-15'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Apple Services', -39.9, '2026-08-04', 'USD'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Office Depot', -725.6, '2026-09-08'),
    tx(SHANI_VISA_BILL, SHANI_ID, 'Adobe Creative Cloud', -59.99, '2026-10-04', 'USD'),

    // Shani Mastercard: advertising, printing, hospitality, and mixed personal spend.
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'Meta Ads', -1850, '2026-01-19'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'דפוס המרכז', -1320, '2026-02-09'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'Wolt for Work', -286.5, '2026-03-24'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'Google Ads', -740, '2026-04-18'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'שופרסל דיל', -612.3, '2026-05-27'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'מלון מצפה הימים', -1680, '2026-06-29'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'דפוס המרכז', -890, '2026-07-11'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'מסעדת טאיזו', -468, '2026-08-17'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'Meta Ads', -2100, '2026-09-12'),
    tx(SHANI_MASTERCARD_BILL, SHANI_ID, 'סופר-פארם', -247.8, '2026-10-08'),

    // Omer card: tools, vehicle costs, supplies, phone, training, and recurring services.
    tx(OMER_CARD_BILL, OMER_ID, 'ACE כלי עבודה', -1180, '2026-01-15'),
    tx(OMER_CARD_BILL, OMER_ID, 'תחנת דלק דלק', -445.2, '2026-02-03'),
    tx(OMER_CARD_BILL, OMER_ID, 'הום סנטר', -735, '2026-03-05'),
    tx(OMER_CARD_BILL, OMER_ID, 'פלאפון', -149, '2026-04-02'),
    tx(OMER_CARD_BILL, OMER_ID, 'מוסך איילון', -2360, '2026-05-14'),
    tx(OMER_CARD_BILL, OMER_ID, 'Udemy - Electrical Safety', -49.99, '2026-06-08', 'USD'),
    tx(OMER_CARD_BILL, OMER_ID, 'תחנת דלק דלק', -472.8, '2026-07-03'),
    tx(OMER_CARD_BILL, OMER_ID, 'רשת חומרי בניין', -960, '2026-08-06'),
    tx(OMER_CARD_BILL, OMER_ID, 'כביש 6', -126.4, '2026-09-06'),
    tx(OMER_CARD_BILL, OMER_ID, 'Google Workspace', -69, '2026-10-06'),
    tx(OMER_CARD_BILL, OMER_ID, 'תחנת דלק דלק', -398.6, '2026-10-18'),
  ],

  sourceSyncStates: [
    { sourceId: SHANI_BANK, type: 'bank', status: 'success', resourceId: 'partner-shani-bank', consentId: DEMO_CONSENT },
    { sourceId: OMER_BANK, type: 'bank', status: 'success', resourceId: 'partner-omer-bank', consentId: DEMO_CONSENT },
    { sourceId: SHANI_VISA, type: 'card', status: 'success', resourceId: 'partner-shani-visa', consentId: DEMO_CONSENT },
    { sourceId: SHANI_MASTERCARD, type: 'card', status: 'success', resourceId: 'partner-shani-mastercard', consentId: DEMO_CONSENT },
    { sourceId: OMER_CARD, type: 'card', status: 'success', resourceId: 'partner-omer-card', consentId: DEMO_CONSENT },
  ],
};

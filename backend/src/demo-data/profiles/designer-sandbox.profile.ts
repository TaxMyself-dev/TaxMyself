import {
  BusinessFieldType,
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
  UserRole,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const DESIGNER_ID = '345678908';
const DESIGNER_BANK = '4821907';
const DESIGNER_CARD = '6382';
const MAIN_BILL = 'designer-main';
const DEMO_CONSENT = 'designer-sandbox-consent';

/**
 * A permanent, isolated product-design sandbox. Its bank/card data is entirely
 * synthetic: it deliberately looks like a completed Open-Banking connection,
 * while server-side guards prevent this identity from ever pulling Feezback.
 */
export const DESIGNER_SANDBOX_PROFILE: DemoProfile = {
  id: 'designer-sandbox',
  label: 'סביבת עבודה למעצבת',
  description:
    'משתמשת רגילה עם עסק מורשה, חשבון בנק וכרטיס אשראי סינתטיים ומגוון תנועות הכנסה והוצאה. החשבון יכול לאפס רק את הנתונים של עצמו ואינו מחובר ל-Feezback.',
  email: 'designer-demo@keepintax.co.il',
  password: 'DesignDemo!2026',
  allowSelfReset: true,
  syntheticOpenBanking: true,
  role: [UserRole.REGULAR],
  hasOpenBanking: true,

  user: {
    fName: 'נועה',
    lName: 'ישראלי',
    id: DESIGNER_ID,
    phone: '0503456789',
    gender: Gender.FEMALE,
    dateOfBirth: '1992-05-18',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  businesses: [
    {
      businessName: 'סטודיו נועה',
      businessNumber: DESIGNER_ID,
      businessType: BusinessType.LICENSED,
      businessField: BusinessFieldType.SERVICE_PROVIDER,
      businessAddress: 'תל אביב',
      advanceTaxPercent: 8,
    },
  ],

  bills: [
    {
      key: MAIN_BILL,
      billName: 'חשבון עסקי - סטודיו נועה',
      businessNumberRef: DESIGNER_ID,
      sources: [
        { sourceName: DESIGNER_BANK, sourceType: SourceType.BANK_ACCOUNT },
        { sourceName: DESIGNER_CARD, sourceType: SourceType.CREDIT_CARD, isDirect: false },
      ],
    },
  ],

  transactions: [
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'העברה מלקוח - חברת אלפא', amount: 12870, daysAgo: 3 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Adobe Creative Cloud', amount: -59.99, daysAgo: 4, currency: 'USD' },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Wolt for Work', amount: -186.4, daysAgo: 6 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'שכירות סטודיו', amount: -4200, daysAgo: 8 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'KSP מחשבים', amount: -1849, daysAgo: 11 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Canva Pro', amount: -109.99, daysAgo: 13 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'העברה מלקוח - בית קפה נורדאו', amount: 4680, daysAgo: 15 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'דפוס העיר', amount: -724.5, daysAgo: 18 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'בזק אינטרנט', amount: -139.9, daysAgo: 21 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Figma Professional', amount: -15, daysAgo: 24, currency: 'USD' },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'העברה מלקוח - אפליקציית בטא', amount: 9360, daysAgo: 27 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'תחנת דלק סונול', amount: -312.7, daysAgo: 31 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Office Depot', amount: -286.3, daysAgo: 36 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'עמלת ניהול חשבון', amount: -29, daysAgo: 39 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_BANK, businessNumberRef: DESIGNER_ID, merchantName: 'העברה מלקוח - מרפאת גמא', amount: 7020, daysAgo: 43 },
    { billKey: MAIN_BILL, paymentIdentifier: DESIGNER_CARD, businessNumberRef: DESIGNER_ID, merchantName: 'Dropbox Plus', amount: -119.88, daysAgo: 47, currency: 'USD' },
  ],

  sourceSyncStates: [
    {
      sourceId: DESIGNER_BANK,
      type: 'bank',
      status: 'success',
      resourceId: 'designer-sandbox-bank-resource',
      consentId: DEMO_CONSENT,
    },
    {
      sourceId: DESIGNER_CARD,
      type: 'card',
      status: 'success',
      resourceId: 'designer-sandbox-card-resource',
      consentId: DEMO_CONSENT,
    },
  ],
};

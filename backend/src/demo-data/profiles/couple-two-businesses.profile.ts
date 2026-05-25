import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const DANIEL_ID = '300111222';
const SARA_ID = '300333444';

export const COUPLE_TWO_BUSINESSES_PROFILE: DemoProfile = {
  id: 'couple-two-businesses',
  label: 'זוג נשוי - שני עסקים (פטור + מורשה)',
  description:
    'דניאל (יועץ עסקי, עוסק פטור) ושרה (מעצבת גרפית, עוסק מורשה). 4 חשבונות, 30 תנועות ב-90 הימים האחרונים.',

  email: 'demo+couple@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'דניאל',
    lName: 'כהן',
    id: DANIEL_ID,
    phone: '0501112222',
    gender: Gender.MALE,
    dateOfBirth: '1985-04-12',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.MARRIED,
  },

  spouse: {
    fName: 'שרה',
    lName: 'כהן',
    id: SARA_ID,
    phone: '0503334444',
    email: 'demo+sarah@taxmyself.local',
    gender: Gender.FEMALE,
    dateOfBirth: '1987-09-23',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
  },

  businesses: [
    {
      businessName: 'דניאל כהן - יועץ עסקי',
      businessNumber: DANIEL_ID,
      businessType: BusinessType.EXEMPT,
      businessField: 'ייעוץ עסקי',
      businessAddress: 'תל אביב',
      advanceTaxPercent: 5,
    },
    {
      businessName: 'שרה כהן - מעצבת גרפית',
      businessNumber: SARA_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'עיצוב גרפי',
      businessAddress: 'תל אביב',
      advanceTaxPercent: 7,
    },
  ],

  bills: [
    // sourceName is the paymentIdentifier — pure digits, mirroring real
    // Feezback values: 8 digits for bank accounts, 4 (last digits) for cards.
    // The friendly bank/card label lives on `billName` for the UI.
    {
      key: 'daniel-checking',
      billName: 'חשבון עו"ש לאומי - דניאל',
      businessNumberRef: DANIEL_ID,
      sources: [{ sourceName: '40621234', sourceType: SourceType.BANK_ACCOUNT }],
    },
    {
      key: 'daniel-card',
      billName: 'כרטיס אשראי ויזה - דניאל',
      businessNumberRef: DANIEL_ID,
      sources: [{ sourceName: '5678', sourceType: SourceType.CREDIT_CARD }],
    },
    {
      key: 'sara-checking',
      billName: 'חשבון עו"ש דיסקונט - שרה',
      businessNumberRef: SARA_ID,
      sources: [{ sourceName: '12349012', sourceType: SourceType.BANK_ACCOUNT }],
    },
    {
      key: 'sara-card',
      billName: 'מאסטרקארד - שרה',
      businessNumberRef: SARA_ID,
      sources: [{ sourceName: '3456', sourceType: SourceType.CREDIT_CARD }],
    },
  ],

  // ~60 transactions across last 180 days (half year).
  // Negative = expense, positive = income. All unclassified.
  transactions: [
    // ===== Daniel — checking account: client incomes + bank fees =====
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - חברת אקמי', amount: 8500, daysAgo: 5 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - סטארטאפ XYZ', amount: 12000, daysAgo: 18 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - בנק הפועלים', amount: 6700, daysAgo: 32 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - גוגל ישראל', amount: 15400, daysAgo: 47 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - חברת אקמי', amount: 9200, daysAgo: 75 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - סטארטאפ XYZ', amount: 11000, daysAgo: 95 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - גוגל ישראל', amount: 14200, daysAgo: 110 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - בנק הפועלים', amount: 7100, daysAgo: 130 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - חברת אקמי', amount: 8800, daysAgo: 155 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'תשלום מלקוח - מיקרוסופט ישראל', amount: 18500, daysAgo: 172 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 30 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 60 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 90 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 120 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 150 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'העברה לחיסכון', amount: -2000, daysAgo: 14 },
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'העברה לחיסכון', amount: -2000, daysAgo: 105 },

    // ===== Daniel — card: business expenses (software, internet, gas, supplies) =====
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 4 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 34 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 64 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 94 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 124 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Google Workspace', amount: -69, daysAgo: 154 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'בזק', amount: -185, daysAgo: 11 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'בזק', amount: -185, daysAgo: 42 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'בזק', amount: -185, daysAgo: 102 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'בזק', amount: -195, daysAgo: 162 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'תחנת דלק פז', amount: -340, daysAgo: 9 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'תחנת דלק פז', amount: -415, daysAgo: 27 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'תחנת דלק פז', amount: -380, daysAgo: 65 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'תחנת דלק פז', amount: -425, daysAgo: 117 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'Office Depot', amount: -612, daysAgo: 22 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'אמזון', amount: -847, daysAgo: 55 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'אמזון', amount: -1240, daysAgo: 138 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'מסעדת מוזס', amount: -245, daysAgo: 88 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'קופיקס', amount: -56, daysAgo: 145 },

    // ===== Sara — checking: incomes + utilities =====
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - מותג אופנה ABC', amount: 9750, daysAgo: 8 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - מותג אופנה ABC', amount: 4200, daysAgo: 38 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - סוכנות פרסום', amount: 7800, daysAgo: 21 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - חברת קוסמטיקה', amount: 3500, daysAgo: 70 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - מותג אופנה ABC', amount: 5800, daysAgo: 100 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - סוכנות פרסום', amount: 12500, daysAgo: 125 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - חברת קוסמטיקה', amount: 4100, daysAgo: 158 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'תשלום מלקוח - מסעדה ים תיכוני', amount: 6300, daysAgo: 175 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'חברת חשמל', amount: -425, daysAgo: 16 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'חברת חשמל', amount: -468, daysAgo: 76 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'חברת חשמל', amount: -512, daysAgo: 136 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'מי אביבים', amount: -195, daysAgo: 25 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'מי אביבים', amount: -210, daysAgo: 87 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'מי אביבים', amount: -198, daysAgo: 148 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 30 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 90 },
    { billKey: 'sara-checking', businessNumberRef: SARA_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 150 },

    // ===== Sara — card: design tools, supplies, supermarket =====
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 3 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 33 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 63 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 93 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 123 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Adobe Creative Cloud', amount: -239, daysAgo: 153 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Figma', amount: -55, daysAgo: 12 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Figma', amount: -55, daysAgo: 72 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'Figma', amount: -55, daysAgo: 132 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'איקאה', amount: -1240, daysAgo: 49 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'איקאה', amount: -680, daysAgo: 142 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'סופר סופר', amount: -380, daysAgo: 6 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'סופר סופר', amount: -425, daysAgo: 41 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'סופר סופר', amount: -512, daysAgo: 79 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'סופר סופר', amount: -448, daysAgo: 113 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'סופר סופר', amount: -390, daysAgo: 168 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'שטראוס', amount: -187, daysAgo: 51 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'אורנג\'', amount: -120, daysAgo: 19 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'אורנג\'', amount: -120, daysAgo: 80 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'אורנג\'', amount: -120, daysAgo: 140 },

    // ===== Cross-bill duplicates =====
    // Same merchant repeated across DIFFERENT bills — used to verify
    // classification rules are scoped to (userId, billId, merchantName) and
    // do NOT leak across payment identifiers / bills.
    //
    // After classifying ONE row, the rule should auto-apply to the other rows
    // ON THE SAME BILL (same merchantName + same paymentIdentifier) — but NOT
    // to rows of the same merchant on a DIFFERENT bill, which must be
    // classified independently.

    // אמזון: appears on daniel-card above; add same merchant on sara-card too.
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'אמזון', amount: -329, daysAgo: 17 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'אמזון', amount: -612, daysAgo: 86 },

    // תחנת דלק פז: above only on daniel-card; add a couple on sara-card.
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'תחנת דלק פז', amount: -290, daysAgo: 36 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'תחנת דלק פז', amount: -360, daysAgo: 108 },

    // קופיקס: above on daniel-card; add same merchant on daniel-checking
    // (rare but realistic — direct debit) AND on sara-card. Three different
    // bills, same merchant — perfect for testing rule isolation.
    { billKey: 'daniel-checking', businessNumberRef: DANIEL_ID, merchantName: 'קופיקס', amount: -42, daysAgo: 28 },
    { billKey: 'sara-card', businessNumberRef: SARA_ID, merchantName: 'קופיקס', amount: -65, daysAgo: 72 },

    // סופר סופר: above only on sara-card; add on daniel-card too.
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'סופר סופר', amount: -445, daysAgo: 24 },
    { billKey: 'daniel-card', businessNumberRef: DANIEL_ID, merchantName: 'סופר סופר', amount: -390, daysAgo: 119 },
  ],
};

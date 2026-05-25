import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
  UserRole,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const ACCOUNTANT_ID = '270000001';
const RACHEL_ID = '350000001';
const MOSHE_ID = '250000002';
const MOSHE_SPOUSE_ID = '350000002';

/**
 * Accountant + 2 delegated clients.
 *
 * - Accountant יוסי לוי has the ACCOUNTANT role and no personal businesses.
 *   The "משרד" tab + accountant tasks tab show his 2 delegated clients.
 * - Client רחל אדמון: single, EXEMPT business (יועצת תזונה).
 * - Client משה ברנשטיין: married, LICENSED business (חשמלאי).
 *
 * Use this profile to verify the client↔accountant flow:
 *   1. Sign in as the accountant → "משרד" → see both clients + auto-generated
 *      VAT/advance-tax/annual tasks.
 *   2. Sign in as a client → /book-keeping/tasks → confirm a workflow.
 *   3. Sign in as the accountant → status updates to "מוכן להכנה" → "סמן כדווח".
 */
export const ACCOUNTANT_WITH_CLIENTS_PROFILE: DemoProfile = {
  id: 'accountant-with-clients',
  label: 'רואה חשבון עם 2 לקוחות',
  description:
    'יוסי לוי (רו"ח) עם 2 לקוחות: רחל (פטור) ומשה (מורשה). ' +
    'מאפשר לבדוק את כל זרימת העבודה בין לקוח לרואה חשבון.',

  email: 'demo+accountant@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'יוסי',
    lName: 'לוי',
    id: ACCOUNTANT_ID,
    phone: '0507770001',
    gender: Gender.MALE,
    dateOfBirth: '1975-06-18',
    city: 'רמת גן',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  // ACCOUNTANT role unlocks the "משרד" tab on the frontend.
  role: [UserRole.ACCOUNTANT],

  // No personal banking — the dashboard's connect-CTA is fine for an accountant
  // who just delegates work; they'd typically navigate straight to משרד.
  hasOpenBanking: false,

  businesses: [],
  bills: [],
  transactions: [],

  delegatedClients: [
    // -------------- Client 1: רחל אדמון (single, EXEMPT) --------------
    {
      email: 'demo+rachel@taxmyself.local',
      password: 'test1234',
      user: {
        fName: 'רחל',
        lName: 'אדמון',
        id: RACHEL_ID,
        phone: '0508880001',
        gender: Gender.FEMALE,
        dateOfBirth: '1989-11-04',
        city: 'תל אביב',
        employmentStatus: EmploymentType.SELF_EMPLOYED,
        familyStatus: FamilyStatus.SINGLE,
      },
      businesses: [
        {
          businessName: 'רחל אדמון - יועצת תזונה',
          businessNumber: RACHEL_ID,
          businessType: BusinessType.EXEMPT,
          businessField: 'ייעוץ תזונה',
          businessAddress: 'תל אביב',
          advanceTaxPercent: 5,
        },
      ],
      bills: [
        {
          key: 'rachel-main',
          billName: 'החשבון שלי',
          businessNumberRef: RACHEL_ID,
          sources: [
            { sourceName: '20011234', sourceType: SourceType.BANK_ACCOUNT },
            { sourceName: '4411',     sourceType: SourceType.CREDIT_CARD },
          ],
        },
      ],
      transactions: [
        // Income
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 850, daysAgo: 3 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 850, daysAgo: 17 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - מרכז בריאות', amount: 4500, daysAgo: 26 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 850, daysAgo: 45 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - מרכז בריאות', amount: 4200, daysAgo: 62 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - לקוח פרטי', amount: 1200, daysAgo: 88 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - מרכז בריאות', amount: 4500, daysAgo: 105 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 850, daysAgo: 132 },
        // Bank fees
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 30 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 90 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 150 },
        // Card expenses
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'שופרסל', amount: -340, daysAgo: 5 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'שופרסל', amount: -425, daysAgo: 39 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'שופרסל', amount: -388, daysAgo: 75 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תחנת דלק סונול', amount: -220, daysAgo: 15 },
        { billKey: 'rachel-main', businessNumberRef: RACHEL_ID, merchantName: 'תחנת דלק סונול', amount: -240, daysAgo: 60 },
      ],
    },

    // -------------- Client 2: משה ברנשטיין (married, LICENSED) --------------
    {
      email: 'demo+moshe@taxmyself.local',
      password: 'test1234',
      user: {
        fName: 'משה',
        lName: 'ברנשטיין',
        id: MOSHE_ID,
        phone: '0509990001',
        gender: Gender.MALE,
        dateOfBirth: '1981-03-22',
        city: 'חיפה',
        employmentStatus: EmploymentType.SELF_EMPLOYED,
        familyStatus: FamilyStatus.MARRIED,
      },
      spouse: {
        fName: 'מירב',
        lName: 'ברנשטיין',
        id: MOSHE_SPOUSE_ID,
        phone: '0509990002',
        email: 'demo+meirav@taxmyself.local',
        gender: Gender.FEMALE,
        dateOfBirth: '1983-07-09',
        employmentStatus: EmploymentType.EMPLOYEE,
      },
      // Two businesses on the same User row — משה owns the LICENSED electrician
      // shop, מירב owns an EXEMPT fitness-coaching business. The "add task"
      // dialog should let the accountant pick which business each task is for.
      businesses: [
        {
          businessName: 'משה ברנשטיין - חשמלאי מוסמך',
          businessNumber: MOSHE_ID,
          businessType: BusinessType.LICENSED,
          businessField: 'עבודות חשמל',
          businessAddress: 'חיפה',
          advanceTaxPercent: 8,
        },
        {
          businessName: 'מירב ברנשטיין - מאמנת כושר',
          businessNumber: MOSHE_SPOUSE_ID,
          businessType: BusinessType.EXEMPT,
          businessField: 'אימוני כושר',
          businessAddress: 'חיפה',
          advanceTaxPercent: 5,
        },
      ],
      bills: [
        {
          key: 'moshe-business',
          billName: 'חשבון עסקי',
          businessNumberRef: MOSHE_ID,
          sources: [{ sourceName: '12005678', sourceType: SourceType.BANK_ACCOUNT }],
        },
        {
          key: 'moshe-private',
          billName: 'חשבון פרטי',
          businessNumberRef: MOSHE_ID,
          sources: [{ sourceName: '8821', sourceType: SourceType.CREDIT_CARD }],
        },
      ],
      transactions: [
        // Income from job sites — flow into the business account
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - בנייני מגורים', amount: 12000, daysAgo: 4 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - חברת בנייה גדולה', amount: 28500, daysAgo: 19 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - שיפוץ פרטי', amount: 6800, daysAgo: 38 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - חברת בנייה גדולה', amount: 31200, daysAgo: 65 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - בנייני מגורים', amount: 9400, daysAgo: 92 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - שיפוץ פרטי', amount: 7200, daysAgo: 118 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - חברת בנייה גדולה', amount: 26500, daysAgo: 145 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'תשלום מלקוח - שיפוץ פרטי', amount: 5100, daysAgo: 168 },
        // Bank fees
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'עמלת ניהול חשבון', amount: -32, daysAgo: 30 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'עמלת ניהול חשבון', amount: -32, daysAgo: 90 },
        { billKey: 'moshe-business', businessNumberRef: MOSHE_ID, merchantName: 'עמלת ניהול חשבון', amount: -32, daysAgo: 150 },
        // Card expenses — supplies, fuel, utilities → private account
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'אולם תאורה הראל', amount: -1850, daysAgo: 8 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'אולם תאורה הראל', amount: -940, daysAgo: 52 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'אולם תאורה הראל', amount: -2300, daysAgo: 110 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'תחנת דלק דור אלון', amount: -380, daysAgo: 11 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'תחנת דלק דור אלון', amount: -415, daysAgo: 35 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'תחנת דלק דור אלון', amount: -395, daysAgo: 70 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'תחנת דלק דור אלון', amount: -440, daysAgo: 125 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'בזק', amount: -210, daysAgo: 28 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'בזק', amount: -210, daysAgo: 88 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'בזק', amount: -210, daysAgo: 148 },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'Office Depot', amount: -512, daysAgo: 47 },
        // Foreign-currency expenses — exercise the FX layer. תזרים column
        // shows the original amount on top and the BOI/demo-rate ILS value
        // in parentheses; Expense.sum at confirm-time gets the ILS value.
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'Anthropic',  amount: -20,  daysAgo: 14, currency: 'USD' },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'GitHub Pro', amount: -10,  daysAgo: 41, currency: 'USD' },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'AWS',        amount: -85,  daysAgo: 22, currency: 'USD' },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'Booking.com Berlin', amount: -260, daysAgo: 60, currency: 'EUR' },
        { billKey: 'moshe-private', businessNumberRef: MOSHE_ID, merchantName: 'Lufthansa',          amount: -480, daysAgo: 75, currency: 'EUR' },
        // מירב's business stays seeded as a Business row for tax-reporting visibility,
        // but she has no dedicated bill or source — so no transactions feed into the
        // cache for her. Per-card transactions can be re-added later if needed.
      ],
    },
  ],
};

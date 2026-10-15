import {
  BusinessFieldType,
  BusinessType,
  DocumentType,
  EmploymentType,
  FamilyStatus,
  Gender,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

/** Tax Authority sandbox issuer that returns a successful allocation scenario. */
export const SHAAM_ALLOCATION_BUSINESS_NUMBER = '777777715';
export const SHAAM_ALLOCATION_CUSTOMER_NUMBER = '515000008';

export const SHAAM_ALLOCATION_TEST_PROFILE: DemoProfile = {
  id: 'shaam-allocation-test',
  label: 'בדיקת שע״מ - מספר הקצאה',
  description:
    'עסק Sandbox של רשות המסים (777777715) עם טיוטת חשבונית מס מוכנה בסכום המחייב מספר הקצאה. יש להזדהות באתר רשות המסים עם משתמש אמיתי המורשה לסביבת הבדיקות.',

  email: 'demo+shaam-allocation@keepintax.local',
  password: 'test1234',
  hasOpenBanking: false,

  user: {
    fName: 'דנה',
    lName: 'בדיקות שע״מ',
    id: SHAAM_ALLOCATION_BUSINESS_NUMBER,
    phone: '0507777715',
    gender: Gender.FEMALE,
    dateOfBirth: '1988-01-15',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  businesses: [
    {
      businessName: 'עסק בדיקה שע״מ - הקצאה',
      businessNumber: SHAAM_ALLOCATION_BUSINESS_NUMBER,
      businessType: BusinessType.LICENSED,
      businessField: BusinessFieldType.SERVICE_PROVIDER,
      businessAddress: 'תל אביב',
      advanceTaxPercent: 0,
    },
  ],

  bills: [],
  transactions: [],

  // The draft is restored automatically on the document-creation page. Its date
  // is resolved when the profile is seeded so SHAAM never receives a stale,
  // hard-coded invoice date.
  documents: [
    {
      businessNumberRef: SHAAM_ALLOCATION_BUSINESS_NUMBER,
      docType: DocumentType.TAX_INVOICE,
      recipientName: 'לקוח בדיקה בע״מ',
      recipientId: SHAAM_ALLOCATION_CUSTOMER_NUMBER,
      sumAftDisBefVAT: 6000,
      vatSum: 1080,
      docDate: 'CURRENT_DATE',
      useCurrentDate: true,
      isDraft: true,
      lines: [
        {
          description: 'שירותי ייעוץ - בדיקת מספר הקצאה',
          unitQuantity: 1,
          sumBefVatPerUnit: 6000,
          discount: 0,
          sumAftDisBefVatPerLine: 6000,
          vatRate: 18,
          vatPerLine: 1080,
        },
      ],
    },
  ],
};

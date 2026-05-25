import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const YOSSI_ID = '200555666';

export const SINGLE_LICENSED_NO_BANKING_PROFILE: DemoProfile = {
  id: 'single-licensed-no-banking',
  label: 'עוסק מורשה יחיד - ללא חיבור בנק',
  description:
    'יוסי לוי (יועץ פיננסי, עוסק מורשה). עסק יחיד ללא חיבור Open Banking — הדאשבורד יציג את הקריאה לחיבור הבנק במקום טבלת תנועות.',

  email: 'demo+single-licensed@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'יוסי',
    lName: 'לוי',
    id: YOSSI_ID,
    phone: '0505556666',
    gender: Gender.MALE,
    dateOfBirth: '1986-08-15',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  businesses: [
    {
      businessName: 'יוסי לוי - ייעוץ פיננסי',
      businessNumber: YOSSI_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'ייעוץ פיננסי',
      businessAddress: 'תל אביב',
      advanceTaxPercent: 7,
    },
  ],

  // No Open-Banking connection → no bills, no sources, no transactions.
  // The seeder still creates the User + Business rows; the frontend shows
  // the "connect your bank" CTA on the dashboard.
  bills: [],
  transactions: [],

  hasOpenBanking: false,
};

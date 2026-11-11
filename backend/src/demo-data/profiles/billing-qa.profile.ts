import {
  BusinessFieldType,
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const BILLING_QA_ID = '288888886';

export const BILLING_QA_PROFILE: DemoProfile = {
  id: 'billing-qa',
  label: 'בדיקות חיובים ומנויים',
  description:
    'משתמש דמו ייעודי לבדיקת חסימת תשלום, חוב בפיגור וסיבת סירוב. כל המצבים סינתטיים ואינם פונים לקארדקום בזמן יצירתם.',
  email: 'demo+billing-qa@taxmyself.local',
  password: 'test1234',
  billingQaScenario: true,
  hasOpenBanking: false,
  user: {
    fName: 'בדיקת',
    lName: 'חיובים',
    id: BILLING_QA_ID,
    phone: '0500000000',
    gender: Gender.MALE,
    dateOfBirth: '1990-01-01',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },
  businesses: [
    {
      businessName: 'עסק דמו לבדיקות חיוב',
      businessNumber: BILLING_QA_ID,
      businessType: BusinessType.LICENSED,
      businessField: BusinessFieldType.SERVICE_PROVIDER,
      businessAddress: 'תל אביב',
    },
  ],
  bills: [],
  transactions: [],
};

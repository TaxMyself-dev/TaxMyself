import { BusinessFieldType, BusinessType, EmploymentType, FamilyStatus, Gender, SourceType } from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

export const QA_MAIN = '999100012';
export const QA_SECOND = '999100020';
export const QA_EMAIL = 'demo+assistant-qa@keepintax.local';
// CLI supplies a generated password; credentials are never tracked in Git.
export const QA_PASSWORD = process.env.ASSISTANT_QA_PASSWORD || '';

// Fictional identities; deterministic 2026 fixture, never live bank connections.
export const QA_EXPENSES = [
  ...['08','09','10'].flatMap((month, i) => [
    { business: QA_MAIN, date: `2026-${month}-05`, supplier: 'דלק הדגמה צפון', supplierId: '999200010', category: 'רכב ותחבורה', sub: 'דלק', sum: [236,354,472][i], state: 'approved' },
    { business: QA_MAIN, date: `2026-${month}-18`, supplier: 'דלק הדגמה דרום', supplierId: '999200028', category: 'רכב ותחבורה', sub: 'דלק', sum: [118,236,354][i], state: 'approved' },
    { business: QA_MAIN, date: `2026-${month}-10`, supplier: 'תקשורת הדגמה', supplierId: '999200036', category: 'דיור והוצאות הבית', sub: 'פלאפון', sum: 118, state: 'approved' },
    { business: QA_MAIN, date: `2026-${month}-12`, supplier: 'תוכנה הדגמה', supplierId: '999200044', category: 'עסק', sub: 'תוכנות', sum: 236, state: 'approved' },
    { business: QA_MAIN, date: `2026-${month}-15`, supplier: 'משרד הדגמה', supplierId: '999200051', category: 'עסק', sub: 'הוצאות משרד', sum: 354, state: 'approved' },
    { business: QA_SECOND, date: `2026-${month}-06`, supplier: 'דלק הדגמה צפון', supplierId: '999200010', category: 'רכב ותחבורה', sub: 'דלק', sum: [118,236,354][i], state: 'approved' },
  ]),
  { business: QA_MAIN, date: '2026-11-03', supplier: 'דלק הדגמה צפון', supplierId: '999200010', category: 'רכב ותחבורה', sub: 'דלק', sum: 590, state: 'approved' },
  { business: QA_MAIN, date: '2026-11-04', supplier: 'תקשורת הדגמה', supplierId: '999200036', category: 'דיור והוצאות הבית', sub: 'פלאפון', sum: 118, state: 'approved' },
  { business: QA_MAIN, date: '2026-11-07', supplier: 'דלק ממתין הדגמה', supplierId: '999200069', category: 'רכב ותחבורה', sub: 'דלק', sum: 118, state: 'pending' },
  { business: QA_MAIN, date: '2026-11-08', supplier: 'משרד ממתין הדגמה', supplierId: '999200077', category: 'עסק', sub: 'הוצאות משרד', sum: 236, state: 'pending' },
  { business: QA_MAIN, date: '2026-11-09', supplier: 'קניות פרטיות הדגמה', supplierId: '999200085', category: 'אוכל וצריכה שוטפת', sub: 'סופרמרקט', sum: 354, state: 'private' },
];

export const QA_CLIENTS = [
  { name: 'לקוח הדגמה אלפא', id: '999300018', business: QA_MAIN },
  { name: 'לקוח הדגמה בטא', id: '999300026', business: QA_MAIN },
  { name: 'לקוח הדגמה ללא מסמכים', id: '999300034', business: QA_MAIN },
  { name: 'לקוח הדגמה גמא', id: '999300042', business: QA_SECOND },
];

export const QA_SALES = [
  ...['08','09','10','11'].map((month, i) => ({ business: QA_MAIN, date: `2026-${month}-02`, client: QA_CLIENTS[i % 2], net: [1000,1500,2000,2500][i] })),
  ...['08','09','10'].map(month => ({ business: QA_SECOND, date: `2026-${month}-02`, client: QA_CLIENTS[3], net: 500 })),
];

export const ASSISTANT_QA_PROFILE: DemoProfile = {
  id: 'assistant-qa', label: 'בדיקות צ׳אט - נתונים מלאים',
  description: 'דמו סינתטי מבודד: שני עסקים, מסמכים מקושרים, לקוחות, ספקים וסיווגים. נתוני אוגוסט–נובמבר 2026.',
  email: QA_EMAIL, password: QA_PASSWORD, syntheticOpenBanking: true, hasOpenBanking: true,
  user: { fName: 'איתי', lName: 'בדיקות', id: QA_MAIN, phone: '0500000000', gender: Gender.MALE, dateOfBirth: '1990-01-01', city: 'חיפה', employmentStatus: EmploymentType.SELF_EMPLOYED, familyStatus: FamilyStatus.MARRIED },
  spouse: { fName: 'נועה', lName: 'בדיקות', id: QA_SECOND, phone: '0500000001', email: 'spouse-assistant-qa@example.invalid', gender: Gender.FEMALE, dateOfBirth: '1991-01-01', employmentStatus: EmploymentType.SELF_EMPLOYED },
  businesses: [
    { businessName: 'סטודיו הדגמה - מורשה', businessNumber: QA_MAIN, businessType: BusinessType.LICENSED, businessField: BusinessFieldType.SERVICE_PROVIDER, advanceTaxPercent: 8 },
    { businessName: 'ייעוץ הדגמה - פטור', businessNumber: QA_SECOND, businessType: BusinessType.EXEMPT, businessField: BusinessFieldType.SERVICE_PROVIDER, advanceTaxPercent: 5 },
  ],
  bills: [
    { key: 'qa-main', billName: 'בנק וכרטיס - סטודיו הדגמה', businessNumberRef: QA_MAIN, sources: [{ sourceName: '99001001', sourceType: SourceType.BANK_ACCOUNT }, { sourceName: '9901', sourceType: SourceType.CREDIT_CARD, isDirect: false }] },
    { key: 'qa-second', billName: 'בנק - ייעוץ הדגמה', businessNumberRef: QA_SECOND, sources: [{ sourceName: '99002002', sourceType: SourceType.BANK_ACCOUNT, connectionRole: 'spouse' }] },
  ],
  transactions: [
    ...QA_EXPENSES.map((e, i) => ({ businessNumberRef: e.business, billKey: e.business === QA_MAIN ? 'qa-main' : 'qa-second', paymentIdentifier: e.business === QA_SECOND ? '99002002' : i % 2 ? '9901' : '99001001', merchantName: e.supplier, amount: -e.sum, transactionDate: e.date })),
    ...QA_SALES.map(s => ({ businessNumberRef: s.business, billKey: s.business === QA_MAIN ? 'qa-main' : 'qa-second', paymentIdentifier: s.business === QA_MAIN ? '99001001' : '99002002', merchantName: s.client.name, amount: s.net * (s.business === QA_MAIN ? 1.18 : 1), transactionDate: s.date })),
    { businessNumberRef: QA_MAIN, billKey: 'qa-main', paymentIdentifier: '99001001', merchantName: 'תשלום ללא מסמך הדגמה', amount: -177, transactionDate: '2026-11-10' },
    { businessNumberRef: QA_MAIN, billKey: 'qa-main', paymentIdentifier: '9901', merchantName: 'תנועה לא מסווגת הדגמה', amount: -59, transactionDate: '2026-11-11' },
  ],
  sourceSyncStates: [{ sourceId: '99001001', type: 'bank', status: 'success' }, { sourceId: '9901', type: 'card', status: 'success' }, { sourceId: '99002002', type: 'bank', status: 'success' }],
};

import {
  BusinessType,
  DocumentType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

// Two businesses under ONE user — one עוסק פטור (no VAT) and one עוסק מורשה
// (VAT). Seeds real Documents + Expenses so journal entries are created and the
// כרטסת (ledger) report shows data for both businesses.
//
// PREREQUISITE: the chart-of-accounts rows must exist in default_booking_account
// (codes 1000, 2400, 2410, 4000, 5000 with correct types) BEFORE seeding —
// otherwise income documents roll back and expense journal lines are skipped.
// See backend/src/bookkeeping/account.seed.ts.
const EXEMPT_ID = '111111118'; // עוסק פטור
const LICENSED_ID = '222222224'; // עוסק מורשה

export const LEDGER_TEST_PROFILE: DemoProfile = {
  id: 'ledger-test',
  label: 'בדיקת כרטסת - שני עסקים (פטור + מורשה)',
  description:
    'משתמש אחד עם שני עסקים (פטור ומורשה), עם מסמכים והוצאות אמיתיים כדי לבדוק את דוח הכרטסת ופקודות היומן.',

  email: 'demo+ledger@keepintax.local',
  password: 'test1234',

  // No Open Banking for this profile — it's about documents/expenses, not תזרים.
  hasOpenBanking: false,

  user: {
    fName: 'יוסי',
    lName: 'לוי',
    id: EXEMPT_ID,
    phone: '0521110000',
    gender: Gender.MALE,
    dateOfBirth: '1986-03-18',
    city: 'חיפה',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  businesses: [
    {
      businessName: 'יוסי לוי - מאמן כושר',
      businessNumber: EXEMPT_ID,
      businessType: BusinessType.EXEMPT,
      businessField: 'ספורט ובריאות',
    },
    {
      businessName: 'רחל לוי - מעצבת פנים',
      businessNumber: LICENSED_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'עיצוב פנים',
    },
  ],

  // Minimal bills so the profile shape is valid (pattern from couple-two-businesses).
  // No transactions are seeded — this profile exercises documents/expenses only.
  bills: [
    {
      key: 'yossi-checking',
      billName: 'חשבון עו"ש - יוסי (פטור)',
      businessNumberRef: EXEMPT_ID,
      sources: [{ sourceName: '10000001', sourceType: SourceType.BANK_ACCOUNT }],
    },
    {
      key: 'rachel-checking',
      billName: 'חשבון עו"ש - רחל (מורשה)',
      businessNumberRef: LICENSED_ID,
      sources: [{ sourceName: '20000002', sourceType: SourceType.BANK_ACCOUNT }],
    },
  ],

  transactions: [],

  // ── Documents ───────────────────────────────────────────────────────────
  documents: [
    // LICENSED (עוסק מורשה) — VAT documents.
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.TAX_INVOICE_RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 5000,
      vatSum: 900,
      docDate: '2026-01-15',
    },
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.TAX_INVOICE_RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 5000,
      vatSum: 900,
      docDate: '2026-02-15',
    },
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.TAX_INVOICE_RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 5000,
      vatSum: 900,
      docDate: '2026-03-15',
    },
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.CREDIT_INVOICE,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 1000,
      vatSum: 180,
      docDate: '2026-02-20',
    },

    // LICENSED — TAX_INVOICE (without payment, stays OPEN)
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.TAX_INVOICE,
      recipientName: 'לקוח B בע"מ',
      recipientId: '515000001',
      sumAftDisBefVAT: 8000,
      vatSum: 1440,
      docDate: '2026-01-20',
    },
    // LICENSED — second credit note in a different period
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.CREDIT_INVOICE,
      recipientName: 'לקוח B בע"מ',
      recipientId: '515000001',
      sumAftDisBefVAT: 2000,
      vatSum: 360,
      docDate: '2026-03-10',
    },

    // LICENSED — RECEIPT acknowledges payment received (vatSum=0; VAT was on the invoice)
    {
      businessNumberRef: LICENSED_ID,
      docType: DocumentType.RECEIPT,
      recipientName: 'לקוח C',
      recipientId: '520000001',
      sumAftDisBefVAT: 3000,
      vatSum: 0,
      docDate: '2026-02-25',
    },

    // EXEMPT (עוסק פטור) — receipts, no VAT.
    {
      businessNumberRef: EXEMPT_ID,
      docType: DocumentType.RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 3000,
      vatSum: 0,
      docDate: '2026-01-10',
    },
    {
      businessNumberRef: EXEMPT_ID,
      docType: DocumentType.RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 3000,
      vatSum: 0,
      docDate: '2026-02-10',
    },
    {
      businessNumberRef: EXEMPT_ID,
      docType: DocumentType.RECEIPT,
      recipientName: 'לקוח לדוגמה',
      sumAftDisBefVAT: 3000,
      vatSum: 0,
      docDate: '2026-03-10',
    },
  ],

  // ── Expenses ────────────────────────────────────────────────────────────
  expenses: [
    // LICENSED — general office expenses (routes to 5100 הוצאות משרד).
    { businessNumberRef: LICENSED_ID, merchantName: 'ספק ציוד משרדי', sum: 500, vatPercent: 100, expenseDate: '2026-01-25', category: 'עסק', subCategory: 'הוצאות משרד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ספק ציוד משרדי', sum: 500, vatPercent: 100, expenseDate: '2026-02-25', category: 'עסק', subCategory: 'הוצאות משרד' },

    // EXEMPT — general office expenses, no VAT (routes to 5100).
    { businessNumberRef: EXEMPT_ID, merchantName: 'ספק כללי', sum: 300, vatPercent: 0, expenseDate: '2026-01-20', category: 'עסק', subCategory: 'הוצאות משרד' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ספק כללי', sum: 300, vatPercent: 0, expenseDate: '2026-02-20', category: 'עסק', subCategory: 'הוצאות משרד' },

    // ───────────────────────────────────────────────────────────────────────
    // Multi-account expenses — spread across expense accounts (Jan–Mar 2026).
    // category/subCategory drive the journal accountCode via default_sub_category
    // (pnlCategory → accountCode, seeded by AccountSeedService).
    // ───────────────────────────────────────────────────────────────────────

    // EXEMPT (111111118) — עוסק פטור, no VAT.
    // 5100 — הוצאות משרד
    { businessNumberRef: EXEMPT_ID, merchantName: 'ארנונה', sum: 200, vatPercent: 0, expenseDate: '2026-01-05', category: 'דיור והוצאות הבית', subCategory: 'ארנונה' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'חשמל', sum: 150, vatPercent: 0, expenseDate: '2026-01-15', category: 'דיור והוצאות הבית', subCategory: 'חשמל' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ועד בית', sum: 120, vatPercent: 0, expenseDate: '2026-02-05', category: 'דיור והוצאות הבית', subCategory: 'ועד בית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'תחזוקה', sum: 300, vatPercent: 0, expenseDate: '2026-02-20', category: 'דיור והוצאות הבית', subCategory: 'תחזוקה' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'שכירות משרד', sum: 1500, vatPercent: 0, expenseDate: '2026-03-01', category: 'עסק', subCategory: 'שכירות משרד' },
    // 5200 — רכב ותחבורה
    { businessNumberRef: EXEMPT_ID, merchantName: 'דלק', sum: 400, vatPercent: 0, expenseDate: '2026-01-08', category: 'רכב ותחבורה', subCategory: 'דלק' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'חניה', sum: 100, vatPercent: 0, expenseDate: '2026-01-20', category: 'רכב ותחבורה', subCategory: 'חניה' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ביטוח רכב', sum: 800, vatPercent: 0, expenseDate: '2026-02-01', category: 'רכב ותחבורה', subCategory: 'ביטוח רכב' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'תחבורה ציבורית', sum: 80, vatPercent: 0, expenseDate: '2026-02-15', category: 'רכב ותחבורה', subCategory: 'תחבורה ציבורית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'כבישי אגרה', sum: 60, vatPercent: 0, expenseDate: '2026-03-10', category: 'רכב ותחבורה', subCategory: 'כבישי אגרה' },
    // 5300 — תקשורת ותוכנות
    { businessNumberRef: EXEMPT_ID, merchantName: 'פלאפון', sum: 150, vatPercent: 0, expenseDate: '2026-01-10', category: 'דיור והוצאות הבית', subCategory: 'פלאפון' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'אינטרנט', sum: 100, vatPercent: 0, expenseDate: '2026-01-25', category: 'דיור והוצאות הבית', subCategory: 'אינטרנט' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'תוכנות', sum: 200, vatPercent: 0, expenseDate: '2026-02-10', category: 'עסק', subCategory: 'תוכנות' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'טלפון קווי', sum: 80, vatPercent: 0, expenseDate: '2026-02-25', category: 'דיור והוצאות הבית', subCategory: 'טלפון קווי' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'תוכנה נוספת', sum: 250, vatPercent: 0, expenseDate: '2026-03-15', category: 'עסק', subCategory: 'תוכנות' },
    // 5500 — ייעוץ ושירותים מקצועיים
    { businessNumberRef: EXEMPT_ID, merchantName: 'ייעוץ עסקי', sum: 500, vatPercent: 0, expenseDate: '2026-01-12', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'השתלמות מקצועית', sum: 800, vatPercent: 0, expenseDate: '2026-01-28', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ייעוץ שיווקי', sum: 600, vatPercent: 0, expenseDate: '2026-02-12', category: 'עסק', subCategory: 'ייעוץ מקצועי' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'קורס מקצועי', sum: 1200, vatPercent: 0, expenseDate: '2026-02-28', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ייעוץ משפטי', sum: 700, vatPercent: 0, expenseDate: '2026-03-20', category: 'עסק', subCategory: 'ייעוץ מקצועי' },
    // 5900 — ספרות מקצועית
    { businessNumberRef: EXEMPT_ID, merchantName: 'ספר מקצועי', sum: 120, vatPercent: 0, expenseDate: '2026-01-18', category: 'עסק', subCategory: 'ספרות מקצועית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'מנוי מקצועי', sum: 200, vatPercent: 0, expenseDate: '2026-02-03', category: 'עסק', subCategory: 'ספרות מקצועית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ספרות עסקית', sum: 90, vatPercent: 0, expenseDate: '2026-02-18', category: 'עסק', subCategory: 'ספרות מקצועית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'כתב עת', sum: 150, vatPercent: 0, expenseDate: '2026-03-05', category: 'עסק', subCategory: 'ספרות מקצועית' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ספר הדרכה', sum: 180, vatPercent: 0, expenseDate: '2026-03-25', category: 'עסק', subCategory: 'ספרות מקצועית' },

    // LICENSED (222222224) — עוסק מורשה, VAT rates per sub-category defaults.
    // 5100 — הוצאות משרד (ארנונה/חשמל have no deductible VAT → vatPercent=0)
    { businessNumberRef: LICENSED_ID, merchantName: 'ארנונה', sum: 300, vatPercent: 0, expenseDate: '2026-01-05', category: 'דיור והוצאות הבית', subCategory: 'ארנונה' },
    { businessNumberRef: LICENSED_ID, merchantName: 'חשמל', sum: 200, vatPercent: 0, expenseDate: '2026-01-15', category: 'דיור והוצאות הבית', subCategory: 'חשמל' },
    { businessNumberRef: LICENSED_ID, merchantName: 'שכירות משרד', sum: 3000, vatPercent: 100, expenseDate: '2026-02-01', category: 'עסק', subCategory: 'שכירות משרד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'הוצאות משרד', sum: 400, vatPercent: 100, expenseDate: '2026-02-15', category: 'עסק', subCategory: 'הוצאות משרד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'שליחויות', sum: 150, vatPercent: 100, expenseDate: '2026-03-10', category: 'עסק', subCategory: 'שליחויות' },
    // 5200 — רכב ותחבורה (דלק/חניה/טיפולים/כבישי אגרה: 67% VAT; ביטוח: 0% VAT)
    { businessNumberRef: LICENSED_ID, merchantName: 'דלק', sum: 600, vatPercent: 67, expenseDate: '2026-01-08', category: 'רכב ותחבורה', subCategory: 'דלק' },
    { businessNumberRef: LICENSED_ID, merchantName: 'חניה', sum: 150, vatPercent: 67, expenseDate: '2026-01-22', category: 'רכב ותחבורה', subCategory: 'חניה' },
    { businessNumberRef: LICENSED_ID, merchantName: 'טיפול רכב', sum: 900, vatPercent: 67, expenseDate: '2026-02-08', category: 'רכב ותחבורה', subCategory: 'טיפולים' },
    { businessNumberRef: LICENSED_ID, merchantName: 'כבישי אגרה', sum: 100, vatPercent: 67, expenseDate: '2026-02-22', category: 'רכב ותחבורה', subCategory: 'כבישי אגרה' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ביטוח רכב', sum: 1200, vatPercent: 0, expenseDate: '2026-03-05', category: 'רכב ותחבורה', subCategory: 'ביטוח רכב' },
    // 5300 — תקשורת ותוכנות
    { businessNumberRef: LICENSED_ID, merchantName: 'פלאפון עסקי', sum: 200, vatPercent: 100, expenseDate: '2026-01-10', category: 'דיור והוצאות הבית', subCategory: 'פלאפון' },
    { businessNumberRef: LICENSED_ID, merchantName: 'אינטרנט', sum: 150, vatPercent: 100, expenseDate: '2026-01-25', category: 'דיור והוצאות הבית', subCategory: 'אינטרנט' },
    { businessNumberRef: LICENSED_ID, merchantName: 'Adobe Creative', sum: 300, vatPercent: 100, expenseDate: '2026-02-10', category: 'עסק', subCategory: 'תוכנות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'תוכנת עיצוב', sum: 500, vatPercent: 100, expenseDate: '2026-02-25', category: 'עסק', subCategory: 'תוכנות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'Zoom', sum: 80, vatPercent: 100, expenseDate: '2026-03-15', category: 'עסק', subCategory: 'תוכנות' },
    // 5400 — שיווק ופרסום
    { businessNumberRef: LICENSED_ID, merchantName: 'פרסום פייסבוק', sum: 800, vatPercent: 100, expenseDate: '2026-01-12', category: 'עסק', subCategory: 'שיווק ופרסום' },
    { businessNumberRef: LICENSED_ID, merchantName: 'גוגל אדס', sum: 1000, vatPercent: 100, expenseDate: '2026-01-28', category: 'עסק', subCategory: 'שיווק ופרסום' },
    { businessNumberRef: LICENSED_ID, merchantName: 'צילום לאתר', sum: 600, vatPercent: 100, expenseDate: '2026-02-12', category: 'עסק', subCategory: 'שיווק ופרסום' },
    { businessNumberRef: LICENSED_ID, merchantName: 'עיצוב לוגו', sum: 400, vatPercent: 100, expenseDate: '2026-02-28', category: 'עסק', subCategory: 'שיווק ופרסום' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ניהול סושיאל', sum: 1500, vatPercent: 100, expenseDate: '2026-03-20', category: 'עסק', subCategory: 'שיווק ופרסום' },
    // 5500 — ייעוץ ושירותים מקצועיים
    { businessNumberRef: LICENSED_ID, merchantName: 'ייעוץ עסקי', sum: 800, vatPercent: 100, expenseDate: '2026-01-14', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'עורך דין', sum: 1200, vatPercent: 100, expenseDate: '2026-01-30', category: 'עסק', subCategory: 'ייעוץ מקצועי' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ייעוץ מיתוג', sum: 900, vatPercent: 100, expenseDate: '2026-02-14', category: 'עסק', subCategory: 'ייעוץ מקצועי' },
    { businessNumberRef: LICENSED_ID, merchantName: 'השתלמות עיצוב', sum: 1500, vatPercent: 100, expenseDate: '2026-02-28', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'קורס עיצוב פנים', sum: 2000, vatPercent: 100, expenseDate: '2026-03-22', category: 'עסק', subCategory: 'ייעוץ והשתלמויות' },
    // 5600 — הנהלת חשבונות
    { businessNumberRef: LICENSED_ID, merchantName: 'רואה חשבון', sum: 500, vatPercent: 100, expenseDate: '2026-01-31', category: 'עסק', subCategory: 'רואה חשבון' },
    { businessNumberRef: LICENSED_ID, merchantName: 'הנהלת חשבונות', sum: 400, vatPercent: 100, expenseDate: '2026-02-28', category: 'עסק', subCategory: 'הנהלת חשבונות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ייעוץ מס', sum: 600, vatPercent: 100, expenseDate: '2026-03-31', category: 'עסק', subCategory: 'רואה חשבון' },
    { businessNumberRef: LICENSED_ID, merchantName: 'הכנת דוחות', sum: 800, vatPercent: 100, expenseDate: '2026-01-15', category: 'עסק', subCategory: 'הנהלת חשבונות' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ביקורת שנתית', sum: 1500, vatPercent: 100, expenseDate: '2026-02-15', category: 'עסק', subCategory: 'רואה חשבון' },
    // 6000 — כיבוד (meals/entertainment: no VAT input deduction → vatPercent=0)
    { businessNumberRef: LICENSED_ID, merchantName: 'כיבוד ישיבות', sum: 200, vatPercent: 0, expenseDate: '2026-01-20', category: 'עסק', subCategory: 'כיבוד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'קפה ללקוחות', sum: 150, vatPercent: 0, expenseDate: '2026-02-05', category: 'עסק', subCategory: 'כיבוד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'כיבוד אורחים', sum: 300, vatPercent: 0, expenseDate: '2026-02-20', category: 'עסק', subCategory: 'כיבוד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ארוחת עסקית', sum: 250, vatPercent: 0, expenseDate: '2026-03-08', category: 'עסק', subCategory: 'כיבוד' },
    { businessNumberRef: LICENSED_ID, merchantName: 'כיבוד ישיבת צוות', sum: 180, vatPercent: 0, expenseDate: '2026-03-22', category: 'עסק', subCategory: 'כיבוד' },
    // 6100 — עמלות ודמי כרטיס
    { businessNumberRef: LICENSED_ID, merchantName: 'עמלות בנק', sum: 80, vatPercent: 100, expenseDate: '2026-01-31', category: 'עסק', subCategory: 'עמלות ודמי כרטיס' },
    { businessNumberRef: LICENSED_ID, merchantName: 'דמי כרטיס אשראי', sum: 120, vatPercent: 100, expenseDate: '2026-02-28', category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס' },
    { businessNumberRef: LICENSED_ID, merchantName: 'ריבית הלוואה', sum: 200, vatPercent: 100, expenseDate: '2026-03-31', category: 'בנק, אשראי ותנועות', subCategory: 'ריבית' },
    { businessNumberRef: LICENSED_ID, merchantName: 'עמלת העברה', sum: 50, vatPercent: 100, expenseDate: '2026-01-15', category: 'עסק', subCategory: 'עמלות ודמי כרטיס' },
    { businessNumberRef: LICENSED_ID, merchantName: 'דמי ניהול חשבון', sum: 90, vatPercent: 100, expenseDate: '2026-02-15', category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס' },

    // ── Partial-deductibility (taxPercent < 100) — EXEMPT ────────────────────
    // Vehicle — 45% tax deductible (עוסק פטור has vatPercent=0)
    { businessNumberRef: EXEMPT_ID, merchantName: 'דלק 45%', sum: 500, vatPercent: 0, taxPercent: 45, expenseDate: '2026-01-15', category: 'רכב ותחבורה', subCategory: 'דלק' },
    { businessNumberRef: EXEMPT_ID, merchantName: 'ביטוח רכב 45%', sum: 1000, vatPercent: 0, taxPercent: 45, expenseDate: '2026-02-01', category: 'רכב ותחבורה', subCategory: 'ביטוח רכב' },
    // Meals — 80% tax deductible
    { businessNumberRef: EXEMPT_ID, merchantName: 'כיבוד ישיבה', sum: 300, vatPercent: 0, taxPercent: 80, expenseDate: '2026-01-22', category: 'עסק', subCategory: 'כיבוד' },

    // ── Partial-deductibility (taxPercent < 100) — LICENSED ──────────────────
    // Vehicle — 45% tax, 67% VAT (רכב פרטי: 2/3 מע"מ מוכר)
    { businessNumberRef: LICENSED_ID, merchantName: 'דלק 45%', sum: 600, vatPercent: 67, taxPercent: 45, expenseDate: '2026-01-18', category: 'רכב ותחבורה', subCategory: 'דלק' },
    // Vehicle insurance — 45% tax, 0% VAT (ביטוח לא מוכר במע"מ)
    { businessNumberRef: LICENSED_ID, merchantName: 'ביטוח רכב 45%', sum: 1200, vatPercent: 0, taxPercent: 45, expenseDate: '2026-02-18', category: 'רכב ותחבורה', subCategory: 'ביטוח רכב' },
    // Meals — 80% tax, 0% VAT (כיבוד לא מוכר במע"מ)
    { businessNumberRef: LICENSED_ID, merchantName: 'כיבוד לקוחות 80%', sum: 500, vatPercent: 0, taxPercent: 80, expenseDate: '2026-01-25', category: 'עסק', subCategory: 'כיבוד' },

    // ── Equipment / fixed asset — LICENSED ───────────────────────────────────
    // Routes to 6300 (רכוש קבוע); isEquipment=true excludes it from P&L expenses
    // and includes it in the depreciation (Form 1342) report instead.
    { businessNumberRef: LICENSED_ID, merchantName: 'מחשב נייד', sum: 5900, vatPercent: 100, taxPercent: 100, expenseDate: '2026-01-10', category: 'רכוש קבוע (פחת)', subCategory: 'מחשב', isEquipment: true },
  ],
};

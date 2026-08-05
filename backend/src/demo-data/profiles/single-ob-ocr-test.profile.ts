import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const YOSI_ID = '312345678';
const YOSI_BANK = '40338811';
const YOSI_CARD = '7744';
const MAIN_BILL_KEY = 'main';

/**
 * Single-user OCR-matching test profile.
 *
 * Single עוסק מורשה connected to Open Banking. Seeded with a handful of
 * Open-Banking transactions plus the 5 sample PDFs sitting at
 * `backend/src/expenses/test-samples/`. The samples get uploaded into the
 * user's Drive inbox both on initial seed and on every "test reset" the
 * user triggers from the dashboard.
 *
 * Purpose: iterate on the OCR pipeline + report-review flow without having
 * to re-upload PDFs and re-clean DB rows between every test. The dashboard
 * shows an inline "אפס נתוני בדיקה" button (gated by `userData.isDemo`)
 * that re-runs the full wipe + re-upload cycle in one click.
 *
 * Sample PDFs at backend/src/expenses/test-samples (anchored 2026-06-14):
 *   1. Invoice-OFOBCQET-0004.pdf  → Anthropic Claude Pro invoice, $20 USD, 2026-05-20
 *   2. Receipt-2280-0056-3066.pdf → Anthropic Claude Pro receipt,  $20 USD, 2026-05-20
 *   3. 80898429_00001_042026_10.pdf → בזק חשבון תקופתי 107.89 ₪, 2026-05-31
 *   4. 926001450406.pdf           → כביש 6 חוצה צפון 14.82 ₪, 2026-05-20
 *   5. חש. מרכזת מאי-26.pdf      → אלרן תחנות כח (דלק) 846.73 ₪, 2026-05-31
 *
 * The OB transactions below are hand-tuned to pair with docs 2, 3, and 4
 * via the unified matcher's ±3-days / ±1-NIS tolerance:
 *   - בזק 107.89 ₪ on 2026-05-29 (daysAgo 16) ↔ doc 3 (issued 2026-05-31)
 *   - כביש 6 14.82 ₪ on 2026-05-21 (daysAgo 24) ↔ doc 4 (2026-05-20)
 *   - Anthropic $20 USD on 2026-05-20 (daysAgo 25) ↔ doc 2 (2026-05-20)
 * Docs 1 + 5 stay unmatched on purpose so the modal shows `doc_only` rows
 * too; the other transactions stay unmatched so `tx_only` rows render.
 *
 * Rebuild dates if you move the seed forward — the daysAgo offsets are
 * relative to seed time, and 2026-05-20 is exactly 25 days before
 * 2026-06-14 (the date the PDFs were read).
 */
export const SINGLE_OB_OCR_TEST_PROFILE: DemoProfile = {
  id: 'single-ob-ocr-test',
  label: 'בדיקות OCR - עוסק יחיד עם בנקאות פתוחה',
  description:
    'יוסי כהן (יעוץ עסקי, עוסק מורשה) עם חיבור פעיל לבנקאות פתוחה ועם 5 קבצי דוגמה שעולים אוטומטית לתיקיית ה-inbox. כולל כפתור "אפס נתוני בדיקה" בלוח הבקרה לאתחול מהיר של סביבת הבדיקות.',

  email: 'demo+ocr-test@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'יוסי',
    lName: 'כהן',
    id: YOSI_ID,
    phone: '0501234567',
    gender: Gender.MALE,
    dateOfBirth: '1985-03-15',
    city: 'תל אביב',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  businesses: [
    {
      businessName: 'יוסי כהן - יעוץ עסקי',
      businessNumber: YOSI_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'יעוץ עסקי',
      businessAddress: 'תל אביב',
      advanceTaxPercent: 8,
    },
  ],

  // One bill backing BOTH sources (bank + card). Every transaction is
  // pre-tagged with `billKey: MAIN_BILL_KEY` so the seeded data lands
  // already-associated — no manual "שייך לחשבון" click per reset.
  // The transactions' own `paymentIdentifier` overrides the bill's first
  // source, so card txns stay on `YOSI_CARD` and bank txns stay on
  // `YOSI_BANK` even though they all share one billId.
  bills: [
    {
      key: MAIN_BILL_KEY,
      billName: 'חשבון יוסי כהן',
      businessNumberRef: YOSI_ID,
      sources: [
        { sourceName: YOSI_BANK, sourceType: SourceType.BANK_ACCOUNT },
        { sourceName: YOSI_CARD, sourceType: SourceType.CREDIT_CARD },
      ],
    },
  ],

  // Not needed any more — both sources now live under the bill above.
  // standaloneSources: [],

  // Every row carries `billKey: MAIN_BILL_KEY` so the seeded transactions
  // land already-associated to the one bill above. The transaction's own
  // `paymentIdentifier` (YOSI_BANK / YOSI_CARD) survives because the seeder
  // only falls back to the bill's first source when the transaction doesn't
  // carry one of its own — see DemoTransactionTemplate.paymentIdentifier
  // for the precedence rule.
  transactions: [
    // ─── Match-targets for the 5 sample PDFs ─────────────────────────────
    // Each of the three rows below is hand-aligned to one sample doc so the
    // matcher (±3 days, ±1 NIS) auto-pairs them on the next report preview.
    // Move any of these out of tolerance and the corresponding doc falls
    // back to a `doc_only` row — handy for hand-testing the manual-link
    // ("שייך לתנועה") button.

    // ↔ Bezeq invoice 245753803 — 107.89 ₪, issued 2026-05-31.
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'בזק בינלאומי', amount: -107.89, daysAgo: 16 },

    // ↔ Kvish 6 invoice 926001450406 — 14.82 ₪, 2026-05-20.
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'כביש 6 חוצה צפון', amount: -14.82, daysAgo: 24 },

    // ↔ Anthropic Claude Pro receipt 2280-0056-3066 — $20 USD, 2026-05-20.
    //   Same-day Anthropic invoice (OFOBCQET-0004) stays unmatched on purpose
    //   so the doc_only column has at least one foreign-currency row.
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'Anthropic - Claude Pro', amount: -20, daysAgo: 25, currency: 'USD' },

    // ─── Unmatched expenses (drive tx_only rows in the modal) ────────────

    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'תחנת דלק פז', amount: -420, daysAgo: 4 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'משרד עורכי דין שלום ושות׳', amount: -1200, daysAgo: 12 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'AWS Cloud Services', amount: -89, daysAgo: 9, currency: 'USD' },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_CARD, businessNumberRef: YOSI_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 2 },

    // ─── Bank incomes + fees ─────────────────────────────────────────────

    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_BANK, businessNumberRef: YOSI_ID, merchantName: 'תשלום מלקוח - חברת תוכנה', amount: 8500, daysAgo: 8 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_BANK, businessNumberRef: YOSI_ID, merchantName: 'תשלום מלקוח - יזם פרטי', amount: 3200, daysAgo: 25 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_BANK, businessNumberRef: YOSI_ID, merchantName: 'תשלום מלקוח - סטרטאפ קטן', amount: 5600, daysAgo: 38 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: YOSI_BANK, businessNumberRef: YOSI_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 30 },
  ],

  // Triggers GoogleDriveService.uploadFile() calls for every PDF in this
  // directory after Drive folders are provisioned. Same directory is used
  // by the test-reset endpoint to re-populate the inbox after wiping.
  // Path is relative to the repo root.
  seedDriveFiles: {
    sourceDir: 'backend/src/expenses/test-samples',
  },
};

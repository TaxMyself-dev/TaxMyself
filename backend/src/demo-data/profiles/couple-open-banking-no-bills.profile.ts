import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const ARIEL_ID = '320111333';
const MICHAL_ID = '320444555';

// Payment identifiers stamped on the seeded cache rows. They mirror what
// real Feezback would return so when the demo presenter creates bills in
// the UI, the new bill→source mapping can group these transactions correctly.
// 8 digits for bank accounts, 4 digits (last digits) for credit cards.
const ARIEL_BANK = '40117788';
const ARIEL_CARD = '1133';
const MICHAL_BANK = '40225599';
const MICHAL_CARD = '4422';

/**
 * Couple connected to Open Banking but with NO bills defined yet.
 *
 * Built so a demo presenter can walk new users through the
 * "create your first bill and associate transactions" flow live:
 *   - Open Banking is "connected" (hasOpenBanking = true, UserSyncState
 *     completed → dashboard shows the transactions table, not the CTA).
 *   - 30+ unassigned transactions spread across 1.1.26 → 1.6.26, stamped
 *     with realistic paymentIdentifiers and businessNumbers but billId=null.
 *   - Husband אריאל has a LICENSED business (computer repair); wife מיכל
 *     has an EXEMPT business (relationship counseling).
 *
 * All `daysAgo` values are computed relative to 2026-06-01 (today).
 * daysAgo: 0 = today (June 1, 2026), daysAgo: 151 ≈ 2026-01-01.
 */
export const COUPLE_OPEN_BANKING_NO_BILLS_PROFILE: DemoProfile = {
  id: 'couple-open-banking-no-bills',
  label: 'זוג עם בנקאות פתוחה - ללא חשבונות מוגדרים',
  description:
    'אריאל (תיקון מחשבים, עוסק מורשה) ומיכל (ייעוץ זוגי, עוסק פטור). חיבור פעיל לבנקאות פתוחה עם תנועות מ-1.1.26 עד 1.6.26, ללא חשבונות מוגדרים — מאפשר להדגים יצירת חשבונות ושיוך תנועות.',

  email: 'demo+couple-nobills@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'אריאל',
    lName: 'לוין',
    id: ARIEL_ID,
    phone: '0506667777',
    gender: Gender.MALE,
    dateOfBirth: '1983-02-19',
    city: 'ירושלים',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.MARRIED,
  },

  spouse: {
    fName: 'מיכל',
    lName: 'לוין',
    id: MICHAL_ID,
    phone: '0508889999',
    email: 'demo+michal-nobills@taxmyself.local',
    gender: Gender.FEMALE,
    dateOfBirth: '1985-06-30',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
  },

  businesses: [
    {
      businessName: 'אריאל לוין - תיקון מחשבים',
      businessNumber: ARIEL_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'תיקון מחשבים',
      businessAddress: 'ירושלים',
      advanceTaxPercent: 7,
    },
    {
      businessName: 'מיכל לוין - ייעוץ זוגי',
      businessNumber: MICHAL_ID,
      businessType: BusinessType.EXEMPT,
      businessField: 'ייעוץ זוגי',
      businessAddress: 'ירושלים',
      advanceTaxPercent: 5,
    },
  ],

  // Intentionally empty — demo presenter creates these live in the UI.
  bills: [],

  // Orphan Source rows — required by the associate-to-bill endpoint, which
  // refuses to invent Source rows (it expects them to already exist from a
  // prior OB sync). Without these, clicking "שייך לחשבון" on a transaction
  // would 404 with "אמצעי התשלום ... לא נמצא בטבלת המקורות".
  standaloneSources: [
    { sourceName: ARIEL_BANK,  sourceType: SourceType.BANK_ACCOUNT },
    { sourceName: ARIEL_CARD,  sourceType: SourceType.CREDIT_CARD },
    { sourceName: MICHAL_BANK, sourceType: SourceType.BANK_ACCOUNT },
    { sourceName: MICHAL_CARD, sourceType: SourceType.CREDIT_CARD },
  ],

  // ~100 unassigned transactions covering 1.1.26 → 26.5.26 (relative to
  // today = 2026-05-26). daysAgo: 0 = today, daysAgo: 145 ≈ 2026-01-02.
  // Layout by paymentIdentifier:
  //   ARIEL_CARD  → household card: mixed personal/business (fuel, utilities,
  //                 grocery, clothing, donations, municipality). The demo
  //                 presenter classifies each as business vs personal.
  //   MICHAL_CARD → Michal's counseling business only (room rental, courses,
  //                 ads, CRM, professional services).
  //   ARIEL_BANK  → business incomes (client payments), cash deposits,
  //                 incoming transfers, outgoing transfers, bank fees.
  //   MICHAL_BANK → counseling incomes, cash deposits, transfers, fees.
  transactions: [
    // ═════════════════════════════════════════════════════════════════════
    //  ARIEL_CARD — household card (mixed personal/business)
    // ═════════════════════════════════════════════════════════════════════

    // --- דלק (fuel) — varies between Paz/Sonol/Delek across the months (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק דלק', amount: -415, daysAgo: 0 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק פז', amount: -380, daysAgo: 6 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק סונול', amount: -425, daysAgo: 22 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק פז', amount: -410, daysAgo: 58 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק דלק', amount: -440, daysAgo: 76 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק סונול', amount: -390, daysAgo: 105 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'תחנת דלק פז', amount: -460, daysAgo: 140 },

    // --- חשמל (electricity) — once per month (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -502, daysAgo: 0 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -485, daysAgo: 10 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -512, daysAgo: 40 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -468, daysAgo: 70 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -545, daysAgo: 100 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'חברת החשמל לישראל', amount: -498, daysAgo: 130 },

    // --- אינטרנט (internet) — Bezeq monthly (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -185, daysAgo: 1 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -185, daysAgo: 8 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -185, daysAgo: 38 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -185, daysAgo: 68 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -185, daysAgo: 98 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'בזק בינלאומי', amount: -195, daysAgo: 128 },

    // --- פלאפון (mobile) — monthly cellular plan (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 2 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 32 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 62 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 92 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 122 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'פלאפון', amount: -149, daysAgo: 148 },

    // --- ChatGPT (monthly USD subscription — exercises the FX render path) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'OpenAI ChatGPT', amount: -20, daysAgo: 9,   currency: 'USD' },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'OpenAI ChatGPT', amount: -20, daysAgo: 39,  currency: 'USD' },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'OpenAI ChatGPT', amount: -20, daysAgo: 69,  currency: 'USD' },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'OpenAI ChatGPT', amount: -20, daysAgo: 99,  currency: 'USD' },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'OpenAI ChatGPT', amount: -20, daysAgo: 129, currency: 'USD' },

    // --- סופרמרקטים (שופרסל / רמי לוי / יוחננוף) — at least one per month (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'שופרסל', amount: -310, daysAgo: 0 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'יוחננוף', amount: -240, daysAgo: 3 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'רמי לוי', amount: -385, daysAgo: 27 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'יוחננוף', amount: -195, daysAgo: 45 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'שופרסל', amount: -355, daysAgo: 78 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'רמי לוי', amount: -425, daysAgo: 95 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'יוחננוף', amount: -312, daysAgo: 115 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'שופרסל', amount: -290, daysAgo: 145 },

    // --- מכולת שכונתית — at least one per month (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -90, daysAgo: 1 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -85, daysAgo: 14 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -105, daysAgo: 42 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -120, daysAgo: 63 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -112, daysAgo: 100 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'מכולת השכונה', amount: -98, daysAgo: 138 },

    // --- חנויות בגדים ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'זארה', amount: -380, daysAgo: 18 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'קסטרו', amount: -245, daysAgo: 52 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'H&M', amount: -185, daysAgo: 88 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'רנואר', amount: -420, daysAgo: 110 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'גולף', amount: -290, daysAgo: 135 },

    // --- תרומות ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'יד שרה', amount: -200, daysAgo: 30 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עזר מציון', amount: -180, daysAgo: 90 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'קרן אבי חי', amount: -250, daysAgo: 142 },

    // --- ארנונה — עיריית ירושלים, חיוב חודשי בסך 560 (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 0 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 5 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 35 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 65 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 95 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -560, daysAgo: 125 },

    // --- עיריית ירושלים — חיוב חודשי בסך 3400 (Jan–Jun) ---
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 0 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 7 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 37 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 67 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 97 },
    { paymentIdentifier: ARIEL_CARD, businessNumberRef: ARIEL_ID, merchantName: 'עיריית ירושלים', amount: -3400, daysAgo: 127 },

    // ═════════════════════════════════════════════════════════════════════
    //  MICHAL_CARD — Michal's relationship-counseling business expenses
    // ═════════════════════════════════════════════════════════════════════

    // --- שכירות חדר טיפול (monthly) ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'חדר טיפול - בית פלורנטין', amount: -1800, daysAgo: 5 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'חדר טיפול - בית פלורנטין', amount: -1800, daysAgo: 36 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'חדר טיפול - בית פלורנטין', amount: -1800, daysAgo: 66 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'חדר טיפול - בית פלורנטין', amount: -1800, daysAgo: 97 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'חדר טיפול - בית פלורנטין', amount: -1800, daysAgo: 128 },

    // --- ספרים מקצועיים ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'צומת ספרים', amount: -280, daysAgo: 12 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'סטימצקי', amount: -340, daysAgo: 75 },

    // --- כנסים והשתלמויות ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'מכון אדלר - השתלמות', amount: -890, daysAgo: 25 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'כנס אגודת הפסיכותרפיה', amount: -1200, daysAgo: 45 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'מכון מגיד - קורס', amount: -1450, daysAgo: 92 },

    // --- מערכת ניהול ואתר ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Wix - שירותי אתר', amount: -89, daysAgo: 15 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Monday.com', amount: -120, daysAgo: 20 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Monday.com', amount: -120, daysAgo: 51 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Wix - שירותי אתר', amount: -89, daysAgo: 76 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Monday.com', amount: -120, daysAgo: 81 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Monday.com', amount: -120, daysAgo: 111 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Wix - שירותי אתר', amount: -89, daysAgo: 137 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'Monday.com', amount: -120, daysAgo: 142 },

    // --- פרסום ממומן ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'פייסבוק עסקי', amount: -450, daysAgo: 28 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'פייסבוק עסקי', amount: -480, daysAgo: 89 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'גוגל אדס', amount: -620, daysAgo: 113 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'גוגל אדס', amount: -580, daysAgo: 143 },

    // --- ביטוח מקצועי ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'הראל ביטוח', amount: -310, daysAgo: 32 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'הראל ביטוח', amount: -310, daysAgo: 122 },

    // --- שירותים מקצועיים ---
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'סטודיו צילום מקצועי', amount: -1500, daysAgo: 70 },
    { paymentIdentifier: MICHAL_CARD, businessNumberRef: MICHAL_ID, merchantName: 'דפוס מאיר', amount: -250, daysAgo: 102 },

    // ═════════════════════════════════════════════════════════════════════
    //  ARIEL_BANK — incomes, deposits, transfers, fees
    // ═════════════════════════════════════════════════════════════════════

    // --- תשלומי לקוחות (incomes from computer-repair clients) ---
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - דקאל בע"מ', amount: 4500, daysAgo: 3 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - אסם', amount: 8200, daysAgo: 18 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - חברת תקשורת', amount: 5600, daysAgo: 32 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - חברת תוכנה', amount: 12500, daysAgo: 55 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - דקאל בע"מ', amount: 4500, daysAgo: 75 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - אסם', amount: 7800, daysAgo: 95 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - חברת תקשורת', amount: 6100, daysAgo: 120 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'תשלום מלקוח - דקאל בע"מ', amount: 4500, daysAgo: 140 },

    // --- הפקדות מזומן ---
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'הפקדת מזומן', amount: 1500, daysAgo: 10 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'הפקדת מזומן', amount: 2200, daysAgo: 70 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'הפקדת מזומן', amount: 1800, daysAgo: 130 },

    // --- העברות בנקאיות נכנסות ---
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'העברה מבנק לאומי', amount: 3500, daysAgo: 25 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'העברה מבנק הפועלים', amount: 2800, daysAgo: 85 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'העברה מבנק דיסקונט', amount: 4200, daysAgo: 110 },

    // --- העברות יוצאות (לחיסכון) ---
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'העברה לחיסכון - בנק לאומי', amount: -2000, daysAgo: 15 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'העברה לחיסכון - בנק לאומי', amount: -2000, daysAgo: 105 },

    // --- עמלות ---
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 30 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 60 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 90 },
    { paymentIdentifier: ARIEL_BANK, businessNumberRef: ARIEL_ID, merchantName: 'עמלת ניהול חשבון', amount: -28, daysAgo: 120 },

    // ═════════════════════════════════════════════════════════════════════
    //  MICHAL_BANK — incomes, deposits, transfers, fees
    // ═════════════════════════════════════════════════════════════════════

    // --- תשלומי לקוחות (counseling sessions + workshop packages) ---
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 600, daysAgo: 5 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 1200, daysAgo: 22 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - מרכז משפחה', amount: 2800, daysAgo: 45 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 600, daysAgo: 68 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 1200, daysAgo: 99 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - מרכז משפחה', amount: 2500, daysAgo: 125 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'תשלום מלקוח - לקוחה פרטית', amount: 800, daysAgo: 145 },

    // --- הפקדות מזומן ---
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'הפקדת מזומן', amount: 500, daysAgo: 30 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'הפקדת מזומן', amount: 800, daysAgo: 100 },

    // --- העברות (in from spouse, out to savings) ---
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'העברה מבעל החשבון', amount: 1500, daysAgo: 50 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'העברה לחיסכון', amount: -1000, daysAgo: 80 },

    // --- עמלות ---
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 60 },
    { paymentIdentifier: MICHAL_BANK, businessNumberRef: MICHAL_ID, merchantName: 'עמלת ניהול חשבון', amount: -22, daysAgo: 120 },
  ],
};

import {
  BusinessType,
  EmploymentType,
  FamilyStatus,
  Gender,
  SourceType,
} from 'src/enum';
import { DemoProfile } from '../demo-profile.types';

const NOAM_ID = '340777888';
/** Bank account (IBAN last-7 in production; any stable digits here). */
const NOAM_BANK = '81102244';
/** Direct/Debit card, masked PAN last-4. */
const NOAM_DIRECT_CARD = '9012';
const MAIN_BILL_KEY = 'main';

/**
 * Fake but STABLE Feezback identifiers. Real syncs get these from discovery
 * (`refreshUserSources`); this profile never calls Feezback, so they're
 * hardcoded. They only need to be non-null and unchanging — the settings page
 * shows "✓ פעיל" for any non-null consentId, and nothing dereferences them
 * unless a pull is attempted (which the Direct card never offers).
 */
const DEMO_CONSENT_ID = 'demo-consent-direct-card-0001';
const DEMO_BANK_RESOURCE_ID = 'demo-resource-bank-81102244';
const DEMO_CARD_RESOURCE_ID = 'demo-resource-card-9012';

/**
 * Permanent Direct/Debit-card demo user.
 *
 * Purpose: manually verify the Direct-card flow end-to-end without touching the
 * real Feezback API. It reproduces the exact production shape of a user who
 * holds a Direct card:
 *
 *   - two sources: one BANK_ACCOUNT and one CREDIT_CARD with `isDirect = true`
 *     (persisted the same way `refreshUserSources` persists a real detection);
 *   - EVERY transaction belongs to the BANK account. A Direct card's purchases
 *     are charged straight to the checking account, so they arrive through the
 *     bank feed — the card feed is deliberately never imported. The card
 *     therefore exists as a source with zero transactions of its own;
 *   - `user_source_sync_state`: bank = `success` (count derived from the seeded
 *     transactions), card = `skipped_direct` with count 0. `skipped_direct` is
 *     terminal by design and is what makes the frontend render the
 *     "כרטיס דיירקט" label, hide the per-source pull button, and show the
 *     "התנועות נמשכות דרך חשבון הבנק" note instead of an error.
 *
 * Everything else (bill, transactions, sync state) follows the normal demo
 * seeding path — there is no Direct-card-specific logic in the seeder.
 *
 * Nightly cache cleanup skips demo users (see
 * TransactionProcessingService.runDailyCacheCleanup), so this profile stays
 * usable indefinitely; "אפס נתוני בדיקה" re-anchors the transaction dates to
 * today and restores this exact state.
 *
 * The state described above is the POST-fix state — it is what a plain seed
 * and a plain reset both produce. `legacyDuplicateScenario` (bottom of this
 * file) additionally opts the profile into two admin-only actions that flip it
 * between the pre-fix state (duplicates visible) and this one, so the fix can
 * be demonstrated end-to-end. See `DemoLegacyDuplicateScenario`.
 */
export const DIRECT_CARD_DEMO_PROFILE: DemoProfile = {
  id: 'direct-card-demo',
  label: 'כרטיס דיירקט - עוסק יחיד',
  description:
    'נועם ברק (עיצוב גרפי, עוסק מורשה) עם חשבון בנק וכרטיס דיירקט. כל התנועות מגיעות מחשבון הבנק בלבד; הכרטיס קיים כמקור עם סטטוס skipped_direct וללא תנועות — בדיוק כמו בייצור. לבדיקה ידנית של זרימת כרטיס הדיירקט ללא קריאה ל-Feezback.',

  email: 'demo+direct-card@taxmyself.local',
  password: 'test1234',

  user: {
    fName: 'נועם',
    lName: 'ברק',
    id: NOAM_ID,
    phone: '0526677889',
    gender: Gender.MALE,
    dateOfBirth: '1990-11-02',
    city: 'חיפה',
    employmentStatus: EmploymentType.SELF_EMPLOYED,
    familyStatus: FamilyStatus.SINGLE,
  },

  // Regular user (no `role` override → [REGULAR]) with a single business.
  businesses: [
    {
      businessName: 'נועם ברק - עיצוב גרפי',
      businessNumber: NOAM_ID,
      businessType: BusinessType.LICENSED,
      businessField: 'עיצוב גרפי',
      businessAddress: 'חיפה',
      advanceTaxPercent: 7,
    },
  ],

  // Standard Bill relationship — one bill backing both sources, same as the
  // other demo profiles. No special handling for the Direct card here.
  bills: [
    {
      key: MAIN_BILL_KEY,
      billName: 'חשבון נועם ברק',
      businessNumberRef: NOAM_ID,
      sources: [
        { sourceName: NOAM_BANK, sourceType: SourceType.BANK_ACCOUNT },
        // The Direct card. `isDirect: true` is the whole point of this profile.
        { sourceName: NOAM_DIRECT_CARD, sourceType: SourceType.CREDIT_CARD, isDirect: true },
      ],
    },
  ],

  // EVERY row is tagged with the BANK paymentIdentifier — never the card.
  // This mirrors production: a Direct card's purchases are debited from the
  // checking account and therefore arrive on the bank feed. Adding a row with
  // `paymentIdentifier: NOAM_DIRECT_CARD` would break the scenario (and would
  // also inflate the card's derived transactionCount above 0).
  transactions: [
    // ─── Purchases (all via the bank feed) ───────────────────────────────
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'שופרסל דיל', amount: -318.4, daysAgo: 2 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'תחנת דלק סונול', amount: -287.5, daysAgo: 5 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'Adobe Creative Cloud', amount: -59.99, daysAgo: 7, currency: 'USD' },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'סטימצקי', amount: -142, daysAgo: 11 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'פלאפון', amount: -119, daysAgo: 14 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'חשמל - חברת החשמל', amount: -412.75, daysAgo: 18 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'משרד רואי חשבון לוי', amount: -1170, daysAgo: 23 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'ארנונה עיריית חיפה', amount: -640, daysAgo: 31 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'רכישת מסך מחשב - KSP', amount: -2350, daysAgo: 40 },

    // ─── Incomes + bank fees ─────────────────────────────────────────────
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'תשלום מלקוח - סוכנות פרסום', amount: 7020, daysAgo: 6 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'תשלום מלקוח - חברת הייטק', amount: 11700, daysAgo: 20 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'תשלום מלקוח - עסק קטן', amount: 3510, daysAgo: 35 },
    { billKey: MAIN_BILL_KEY, paymentIdentifier: NOAM_BANK, businessNumberRef: NOAM_ID, merchantName: 'עמלת ניהול חשבון', amount: -32, daysAgo: 28 },
  ],

  // The two rows the sync panel + settings sources table read. `sourceId`
  // matches `Source.sourceName` exactly — both tables join on that value.
  // `transactionCount` is intentionally omitted: the seeder derives it from
  // the rows above, so the bank count stays correct if the list changes and
  // the Direct card stays at 0 because nothing is generated for it.
  sourceSyncStates: [
    {
      sourceId: NOAM_BANK,
      type: 'bank',
      status: 'success',
      resourceId: DEMO_BANK_RESOURCE_ID,
      consentId: DEMO_CONSENT_ID,
    },
    {
      sourceId: NOAM_DIRECT_CARD,
      type: 'card',
      // TERMINAL and intentional — never 'failed'/'not_synced'. Nothing
      // (login retry, admin cache clear, consent revoke) walks it back.
      status: 'skipped_direct',
      resourceId: DEMO_CARD_RESOURCE_ID,
      consentId: DEMO_CONSENT_ID,
    },
  ],

  // Opts this profile into the two admin-only actions that demonstrate the
  // Direct-card bug and its fix. The listed merchants get a card-feed twin in
  // the legacy state — five obvious duplicate pairs spread across the period,
  // including one foreign-currency row so the FX columns are covered too.
  // Everything else on the bank feed stays single, which makes the contrast
  // legible: after the fix the list shrinks by exactly these five rows.
  legacyDuplicateScenario: {
    cardSourceName: NOAM_DIRECT_CARD,
    duplicateMerchants: [
      'שופרסל דיל',
      'תחנת דלק סונול',
      'Adobe Creative Cloud',
      'סטימצקי',
      'רכישת מסך מחשב - KSP',
    ],
  },
};

import { DemoProfile } from '../demo-profile.types';
import { COUPLE_TWO_BUSINESSES_PROFILE } from './couple-two-businesses.profile';
import { ACCOUNTANT_WITH_CLIENTS_PROFILE } from './accountant-with-clients.profile';
import { SINGLE_LICENSED_NO_BANKING_PROFILE } from './single-licensed-no-banking.profile';
import { COUPLE_OPEN_BANKING_NO_BILLS_PROFILE } from './couple-open-banking-no-bills.profile';
import { SINGLE_OB_OCR_TEST_PROFILE } from './single-ob-ocr-test.profile';
import { LEDGER_TEST_PROFILE } from './ledger-test.profile';
import { DIRECT_CARD_DEMO_PROFILE } from './direct-card-demo.profile';
import { SHAAM_ALLOCATION_TEST_PROFILE } from './shaam-allocation-test.profile';
import { DESIGNER_SANDBOX_PROFILE } from './designer-sandbox.profile';
import { PARTNER_CANDIDATE_COUPLE_PROFILE } from './partner-candidate-couple.profile';

/**
 * Registry of available demo profiles. To add a new profile:
 *  1. Create a new file `<profile-name>.profile.ts` exporting a `DemoProfile`.
 *  2. Add the export to this array.
 * No service / controller / UI changes are needed.
 */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  COUPLE_TWO_BUSINESSES_PROFILE,
  ACCOUNTANT_WITH_CLIENTS_PROFILE,
  SINGLE_LICENSED_NO_BANKING_PROFILE,
  COUPLE_OPEN_BANKING_NO_BILLS_PROFILE,
  SINGLE_OB_OCR_TEST_PROFILE,
  LEDGER_TEST_PROFILE,
  DIRECT_CARD_DEMO_PROFILE,
  SHAAM_ALLOCATION_TEST_PROFILE,
  DESIGNER_SANDBOX_PROFILE,
  PARTNER_CANDIDATE_COUPLE_PROFILE,
];

/**
 * True when `email` belongs to ANY DEMO_PROFILES entry — primary email or
 * a delegated-client email. Drives `userData.isDemo` on the signed-in user
 * payload and excludes demo users from the nightly cache cleanup in
 * `TransactionProcessingService.runDailyCacheCleanup` (demo users must stay
 * permanently usable — the cleanup would otherwise wipe their transactions
 * and flip their sync state to 'empty').
 *
 * Privileged demo behavior uses the explicit capability helpers below; being
 * a demo by itself does not grant self-reset or external-sync exceptions.
 */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lc = email.toLowerCase();
  for (const p of DEMO_PROFILES) {
    if (p.email.toLowerCase() === lc) return true;
    if (p.delegatedClients?.some((c) => c.email.toLowerCase() === lc)) return true;
  }
  return false;
}

/** Find a DEMO_PROFILE by primary email (case-insensitive). */
export function findDemoProfileByEmail(email: string): DemoProfile | undefined {
  const lc = email.toLowerCase();
  return DEMO_PROFILES.find((p) => p.email.toLowerCase() === lc);
}

/** Capability check for the authenticated primary demo user. */
export function canSelfResetDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return findDemoProfileByEmail(email)?.allowSelfReset === true;
}

/** True when Open-Banking data must stay local to the versioned fixture. */
export function usesSyntheticOpenBanking(email: string | null | undefined): boolean {
  if (!email) return false;
  return findDemoProfileByEmail(email)?.syntheticOpenBanking === true;
}

import { DemoProfile } from '../demo-profile.types';
import { COUPLE_TWO_BUSINESSES_PROFILE } from './couple-two-businesses.profile';
import { ACCOUNTANT_WITH_CLIENTS_PROFILE } from './accountant-with-clients.profile';
import { SINGLE_LICENSED_NO_BANKING_PROFILE } from './single-licensed-no-banking.profile';
import { COUPLE_OPEN_BANKING_NO_BILLS_PROFILE } from './couple-open-banking-no-bills.profile';
import { SINGLE_OB_OCR_TEST_PROFILE } from './single-ob-ocr-test.profile';

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
];

/**
 * True when `email` belongs to ANY DEMO_PROFILES entry — primary email or
 * a delegated-client email. Drives `userData.isDemo` on the signed-in user
 * payload (which the frontend uses to show the "אפס נתוני בדיקה" button)
 * and the guard on the test-reset endpoint (which only demo users can hit).
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

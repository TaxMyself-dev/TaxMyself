import { DemoProfile } from '../demo-profile.types';
import { COUPLE_TWO_BUSINESSES_PROFILE } from './couple-two-businesses.profile';
import { ACCOUNTANT_WITH_CLIENTS_PROFILE } from './accountant-with-clients.profile';

/**
 * Registry of available demo profiles. To add a new profile:
 *  1. Create a new file `<profile-name>.profile.ts` exporting a `DemoProfile`.
 *  2. Add the export to this array.
 * No service / controller / UI changes are needed.
 */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  COUPLE_TWO_BUSINESSES_PROFILE,
  ACCOUNTANT_WITH_CLIENTS_PROFILE,
];

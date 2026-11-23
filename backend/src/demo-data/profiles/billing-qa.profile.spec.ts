import { BILLING_QA_PROFILE } from './billing-qa.profile';
import { DEMO_PROFILES, findDemoProfileByEmail, isDemoEmail } from './index';

describe('billing QA demo profile', () => {
  it('is registered as a dedicated provider-free billing scenario', () => {
    expect(DEMO_PROFILES).toContain(BILLING_QA_PROFILE);
    expect(BILLING_QA_PROFILE.billingQaScenario).toBe(true);
    expect(BILLING_QA_PROFILE.email).toBe(
      'demo+billing-qa@taxmyself.local',
    );
    expect(BILLING_QA_PROFILE.bills).toEqual([]);
    expect(BILLING_QA_PROFILE.transactions).toEqual([]);
  });

  it('participates in the standard demo email registry', () => {
    expect(isDemoEmail(BILLING_QA_PROFILE.email)).toBe(true);
    expect(findDemoProfileByEmail(BILLING_QA_PROFILE.email)).toBe(
      BILLING_QA_PROFILE,
    );
  });
});

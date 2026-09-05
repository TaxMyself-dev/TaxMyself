import { ButtonColor } from 'src/app/components/button/button.enum';
import {
  ADMIN_SUBSCRIPTION_SAVE_BUTTON_COLOR,
  adminPlanDisplayName,
} from './billing-subscriptions.presentation';

describe('admin subscription presentation', () => {
  it('gives the canonical accountant plans distinct labels despite duplicate stored names', () => {
    const storedName = 'מסלול לקוחות רואה חשבון';

    expect(adminPlanDisplayName({ name: storedName, slug: 'referral-basic' }))
      .toBe('הפניית רואה חשבון — בסיסי');
    expect(adminPlanDisplayName({ name: storedName, slug: 'referral-open-banking' }))
      .toBe('הפניית רואה חשבון — כולל בנקאות פתוחה');
  });

  it('preserves unrelated plan names', () => {
    expect(adminPlanDisplayName({ name: 'בקטנה', slug: 'consumer-basic' }))
      .toBe('בקטנה');
    expect(adminPlanDisplayName({ name: null, slug: null })).toBeNull();
  });

  it('uses the design-system BLACK button color for the drawer save action', () => {
    expect(ADMIN_SUBSCRIPTION_SAVE_BUTTON_COLOR).toBe(ButtonColor.BLACK);
  });
});

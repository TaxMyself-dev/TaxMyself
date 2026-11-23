import {
  bankingEntitlement,
  emptyEvidence,
  identityUnits,
} from './feezback-lifecycle.policy';
import {
  BillingAccessMode,
  SubscriptionStatus,
} from '../../billing/enums/billing.enums';
import { ModuleName } from '../../enum';

describe('Feezback cost and own entitlement', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  const identity = (statuses: string[]) => ({
    checkedAt: now.toISOString(),
    error: null,
    consents: statuses.map((status, i) => ({
      id: String(i),
      status,
      validUntil: null,
    })),
  });
  it('counts any number of valid consents once per identity, spouse independently', () => {
    expect(identityUnits(identity(['valid', 'valid']), now)).toBe(1);
    expect(
      identityUnits(identity(['valid']), now) +
        identityUnits(identity(['valid']), now),
    ).toBe(2);
  });
  it('never turns failed/missing evidence or an unknown status into no cost', () => {
    expect(identityUnits(emptyEvidence().primary, now)).toBeNull();
    expect(
      identityUnits({ ...identity(['valid']), error: 'FAILED' }, now),
    ).toBeNull();
    expect(identityUnits(identity(['suspendedByTpp']), now)).toBeNull();
  });
  it('terminal or expired consents do not count, but another bank remains active', () => {
    expect(
      identityUnits(
        identity(['terminatedByTpp', 'revokedByPsu', 'expired']),
        now,
      ),
    ).toBe(0);
    expect(identityUnits(identity(['terminatedByTpp', 'valid']), now)).toBe(1);
    expect(
      identityUnits(
        {
          ...identity(['valid']),
          consents: [{ id: 'x', status: 'valid', validUntil: '2026-11-22' }],
        },
        now,
      ),
    ).toBe(0);
  });
  it('malformed expiry is unknown', () => {
    expect(
      identityUnits(
        {
          ...identity(['valid']),
          consents: [{ id: 'x', status: 'valid', validUntil: 'bad' }],
        },
        now,
      ),
    ).toBeNull();
  });
  it('missing subscription or plan cannot authorize automatic termination', () => {
    expect(bankingEntitlement(null, null, null, [], now).eligible).toBeNull();
    expect(
      bankingEntitlement(
        { status: SubscriptionStatus.ACTIVE } as any,
        null,
        null,
        [],
        now,
      ).eligible,
    ).toBeNull();
  });
  it('trial cancellation removes banking eligibility even while general trial modules remain available', () => {
    const sub = {
      status: SubscriptionStatus.TRIAL,
      trialEnd: new Date('2026-11-30'),
    } as any;
    expect(
      bankingEntitlement(
        sub,
        null,
        { command: 'CANCEL' },
        [ModuleName.OPEN_BANKING],
        now,
      ).eligible,
    ).toBe(false);
    expect(
      bankingEntitlement(
        sub,
        null,
        { command: 'READY', trialEnd: sub.trialEnd.toISOString() },
        [ModuleName.OPEN_BANKING],
        now,
      ).eligible,
    ).toBe(true);
  });
  it('does not disconnect an approved trial awaiting canonical billing activation at its boundary', () => {
    const sub = {
      status: SubscriptionStatus.TRIAL,
      trialEnd: new Date('2026-11-22'),
    } as any;
    expect(
      bankingEntitlement(
        sub,
        null,
        { command: 'READY', trialEnd: sub.trialEnd.toISOString() },
        [],
        now,
      ),
    ).toMatchObject({ eligible: null, reason: 'BILLING_ACTIVATION_PENDING' });
  });
  it('preserves complimentary access and uses own module access for paid subscriptions', () => {
    expect(
      bankingEntitlement(
        { billingAccessMode: BillingAccessMode.COMPLIMENTARY_FULL } as any,
        null,
        null,
        [],
        now,
      ).eligible,
    ).toBe(true);
    const sub = { status: SubscriptionStatus.ACTIVE } as any;
    expect(
      bankingEntitlement(sub, {} as any, null, [ModuleName.OPEN_BANKING], now)
        .eligible,
    ).toBe(true);
    expect(bankingEntitlement(sub, {} as any, null, [], now).eligible).toBe(
      false,
    );
  });
});

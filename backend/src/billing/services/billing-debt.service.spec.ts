import { BillingDebtService } from './billing-debt.service';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAccessMode, BillingObligationKind, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { billingBoundary } from '../domain/billing-debt-periods';

describe('debt accrual without app usage', () => {
  function make() {
    const sub: any = { id: 7, firebaseId: 'owner', status: SubscriptionStatus.PAST_DUE,
      planId: 2, billingAnchorDay: 15, nextBillingDate: billingBoundary('2026-09-15'),
      currentPeriodStart: billingBoundary('2026-08-15'), canceledAt: null };
    const debts: any[] = [{ id: 1, subscriptionId: 7, firebaseIdSnapshot: 'owner',
      kind: BillingObligationKind.RECURRING_PERIOD, status: BillingObligationStatus.OPEN,
      planId: 2, periodStart: '2026-09-15', periodEnd: '2026-10-15',
      amountAgorot: 11800, amountBeforeVatAgorot: 10000, vatAmountAgorot: 1800,
      currency: 'ILS', activeAttemptId: null, satisfiedAttemptId: null }];
    const manager = {
      findOne: jest.fn(async (entity: any) => entity === Subscription ? sub : null),
      find: jest.fn(async () => [...debts]),
      create: jest.fn((_entity: any, value: any) => value),
      save: jest.fn(async (entity: any, value: any) => {
        if (entity === BillingObligation && !value.id) { value.id = debts.length+1; debts.push(value); }
        return value;
      }),
    };
    const ds: any = { manager, transaction: async (work: any) => work(manager) };
    return { sub, debts, manager, service: new BillingDebtService(ds) };
  }
  it('materializes every due period, preserving the first unpaid terms and existing prices', async () => {
    const { service, debts } = make();
    debts.push({ ...debts[0], id: 2, periodStart: '2026-10-15', periodEnd: '2026-11-15',
      amountAgorot: 5900, amountBeforeVatAgorot: 5000, vatAmountAgorot: 900 });
    const result = await service.accrue(7, new Date('2026-11-20'));
    expect(result.map(debt => debt.periodStart)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    expect(result.map(debt => debt.amountAgorot)).toEqual([11800, 5900, 11800]);
    await service.accrue(7, new Date('2026-11-20'));
    expect(debts).toHaveLength(3);
  });
  it('stops at cancellation while keeping previously accrued debts', async () => {
    const { service, sub, debts } = make();
    sub.status = SubscriptionStatus.CANCELED;
    sub.canceledAt = billingBoundary('2026-10-15');
    expect(await service.accrue(7, new Date('2026-12-20'))).toHaveLength(1);
    expect(debts[0].status).toBe(BillingObligationStatus.OPEN);
  });
  it('retains a full already-started period on mid-period cancellation', async () => {
    const { service, sub } = make();
    sub.status = SubscriptionStatus.CANCELED;
    sub.canceledAt = billingBoundary('2026-10-20');
    const result = await service.accrue(7, new Date('2026-12-20'));
    expect(result).toHaveLength(2);
    expect(result[1].amountAgorot).toBe(11800);
  });
  it('does not accrue a next period on the date of a paid cancellation with a non-midnight end', async () => {
    const { service, sub, debts } = make();
    sub.status = SubscriptionStatus.CANCELED;
    sub.currentPeriodEnd = new Date('2026-10-15T09:00:00Z');
    sub.canceledAt = sub.currentPeriodEnd;
    sub.nextBillingDate = null;
    expect(await service.accrue(7, new Date('2026-12-20'))).toHaveLength(1);
    expect(debts[0].periodStart).toBe('2026-09-15');
  });
  it('ends a debt-free paid subscription without inventing a missing price debt', async () => {
    const { service, sub, debts, manager } = make();
    debts.length = 0;
    sub.status = SubscriptionStatus.CANCELED;
    sub.currentPeriodEnd = new Date('2026-10-15T09:00:00Z');
    sub.canceledAt = sub.currentPeriodEnd; sub.nextBillingDate = null;
    expect(await service.accrue(7, new Date('2026-12-20'))).toEqual([]);
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('does not silently infer a price when the original unpaid snapshot is missing', async () => {
    const { service, debts } = make(); debts.length = 0;
    await expect(service.accrue(7, new Date('2026-11-20'))).rejects.toThrow('snapshot');
  });
  it('does not accrue canceled records without an effective cancellation date', async () => {
    const { service, sub } = make(); sub.status = SubscriptionStatus.CANCELED;
    await expect(service.accrue(7)).rejects.toThrow('cancellation');
  });
  it('does not accrue exempt periods or erase previous debt', async () => {
    const { service, sub, debts, manager } = make();
    sub.billingAccessMode = BillingAccessMode.COMPLIMENTARY_FULL;
    expect(await service.accrue(7, new Date('2026-12-20'))).toEqual([]);
    expect(debts).toHaveLength(1);
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rejects another owner before any accrual writes', async () => {
    const { service, manager } = make();
    await expect(service.preview({ actorFirebaseId: 'other', subjectFirebaseId: 'other' }, 7)).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('previews only open debts and refuses an unresolved payment', async () => {
    const { service, debts } = make();
    debts[0].activeAttemptId = 21;
    await expect(service.preview({ actorFirebaseId: 'owner', subjectFirebaseId: 'owner' }, 7)).rejects.toThrow('קיים ניסיון תשלום');
  });
});

import { BillingService } from './billing.service';
import { BillingAttemptStatus, BillingAttemptTrigger } from '../enums/billing.enums';

describe('BillingService checkout resolution gate', () => {
  const actor = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  function attempt(status: BillingAttemptStatus) {
    return { id: 41, status, trigger: BillingAttemptTrigger.CHECKOUT,
      cardcomLowProfileId: 'lp-41' } as any;
  }
  function fixture(initial: any, inspected = initial, reloaded = inspected) {
    const service = Object.create(BillingService.prototype) as BillingService;
    const findOne = jest.fn().mockResolvedValueOnce({ id: 7, firebaseId: 'owner' })
      .mockResolvedValue(reloaded);
    (service as any).subscriptionRepo = { findOne, manager: { findOne } };
    (service as any).billingLifecycleService = {
      inspectHostedCheckout: jest.fn().mockResolvedValue({
        kind: 'APPLIED',
        attempt: inspected,
        outcome:
          inspected?.status === BillingAttemptStatus.CAPTURED
            ? { kind: 'CAPTURED' }
            : { kind: 'UNKNOWN' },
      }),
    };
    (service as any).hostedCompletion = { completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    (service as any).logger = { warn: jest.fn() };
    jest.spyOn(service as any, 'findHostedCheckoutAttempts').mockResolvedValue(initial ? [initial] : []);
    return { service, lifecycle: (service as any).billingLifecycleService, completion: (service as any).hostedCompletion };
  }

  it('uses read-only inspection and idempotent completion before reporting success', async () => {
    const f = fixture(attempt(BillingAttemptStatus.AWAITING_CUSTOMER),
      attempt(BillingAttemptStatus.CAPTURED), attempt(BillingAttemptStatus.COMPLETED));
    await expect(f.service.getCheckoutResolution(actor)).resolves.toEqual({
      status: 'COMPLETED', flow: 'PLANS', lowProfileId: 'lp-41',
    });
    expect(f.lifecycle.inspectHostedCheckout).toHaveBeenCalledWith(actor, 41, 7);
    expect(f.completion.completeCapturedHostedAttempt).toHaveBeenCalledWith({
      firebaseId: 'owner', subscriptionId: 7, billingAttemptId: 41,
    });
  });

  it('keeps an unverifiable lookup pending and never creates another checkout', async () => {
    const unresolved = attempt(BillingAttemptStatus.UNKNOWN);
    const f = fixture(unresolved, unresolved, unresolved);
    await expect(f.service.getCheckoutResolution(actor, 'lp-41')).resolves.toEqual({
      status: 'PENDING', flow: 'PLANS', lowProfileId: 'lp-41',
    });
    expect(f.completion.completeCapturedHostedAttempt).not.toHaveBeenCalled();
  });

  it('reports only a provider-proven terminal decline as retryable', async () => {
    const f = fixture(attempt(BillingAttemptStatus.AWAITING_CUSTOMER), attempt(BillingAttemptStatus.DECLINED));
    await expect(f.service.getCheckoutResolution(actor)).resolves.toEqual({
      status: 'DECLINED', flow: 'PLANS', lowProfileId: 'lp-41',
    });
  });

  it('recovers the active attempt from the server after browser storage is lost', async () => {
    const pending = attempt(BillingAttemptStatus.AWAITING_CUSTOMER);
    const f = fixture(pending, pending, pending);
    await f.service.getCheckoutResolution(actor);
    expect((f.service as any).findHostedCheckoutAttempts).toHaveBeenCalledWith(7, 'owner', undefined);
  });

  it('returns NONE when there is no server-owned checkout', async () => {
    const f = fixture(null);
    await expect(f.service.getCheckoutResolution(actor)).resolves.toEqual({
      status: 'NONE', flow: 'PLANS', lowProfileId: null,
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { BillingAttemptStatus, BillingChargeMode, SubscriptionStatus } from '../enums/billing.enums';
import { AdminBillingService, classifyUnresolvedAttempt } from './admin-billing.service';

function fixture(status = SubscriptionStatus.PAST_DUE) {
  const subscription = {
    id: 7, firebaseId: 'owner', status, planId: 3, paymentMethodId: 9,
    billingAccessMode: 'STANDARD',
  } as any;
  const attempt = { id: 44, stateVersion: 0, status: BillingAttemptStatus.CREATED } as any;
  const planRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 3, name: 'Plan' }) };
  const subscriptionRepo = { findOneBy: jest.fn().mockResolvedValue(subscription) };
  const dataSource = { manager: { findOne: jest.fn().mockResolvedValue(null) } };
  const renewal = { completeCapturedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
  const receipt = { ensureReceiptForCapturedAttempt: jest.fn() };
  const issuer = { getKeepintaxIssuer: jest.fn().mockResolvedValue({ issuerName: 'Keepintax' }) };
  const debt = { preview: jest.fn().mockResolvedValue({
    obligationIds: [1, 2], recoveryQuote: '1234567890123456', finalAmountAgorot: 2360,
    amountBeforeVatAgorot: 2000, vatAmountAgorot: 360, currency: 'ILS', periods: [], planId: 3,
  }) };
  const orchestration = {
    createRecoveryCollection: jest.fn().mockResolvedValue({ attempt, created: true }),
    createOrGetAttempt: jest.fn().mockResolvedValue({ attempt, created: true }),
  };
  const provider = { submitCharge: jest.fn().mockResolvedValue({
    kind: 'APPLIED', outcome: { kind: 'CAPTURED', cardcomTransactionId: 'tx-1' }, attempt,
  }) };
  const lifecycle = { resumeCapturedAttempt: jest.fn().mockResolvedValue({ status: 'COMPLETED', attempt }) };
  const service = new AdminBillingService(
    planRepo as any, subscriptionRepo as any, dataSource as any, renewal as any,
    {} as any, receipt as any, issuer as any, {} as any,
    debt as any, orchestration as any, provider as any, lifecycle as any,
  );
  return { service, subscriptionRepo, renewal, debt, orchestration, provider, lifecycle };
}

describe('AdminBillingService manual collection', () => {
  it('surfaces a terminal CardCom decline as customer payment-method action', () => {
    expect(classifyUnresolvedAttempt(BillingAttemptStatus.DECLINED, 'PROVIDER_DECLINED')).toEqual({
      failureCategory: 'PROVIDER_DECLINED', requiredAction: 'CUSTOMER_PAYMENT_METHOD',
    });
  });
  it('settles the full PAST_DUE quote once using the saved token', async () => {
    const f = fixture();
    const result = await f.service.settleDebtWithSavedCard(
      7, 'admin', [1, 2], '1234567890123456',
    );
    expect(f.orchestration.createRecoveryCollection).toHaveBeenCalledWith(
      expect.objectContaining({ subjectFirebaseId: 'owner' }), 7, [1, 2],
      '1234567890123456', BillingChargeMode.TOKEN_TRANSACTION, 'admin',
    );
    expect(f.provider.submitCharge).toHaveBeenCalledTimes(1);
    expect(f.renewal.completeCapturedAttempt).toHaveBeenCalledWith(44);
    expect(result.status).toBe('SETTLED');
  });

  it('never uses debt settlement to activate a healthy subscription', async () => {
    const f = fixture(SubscriptionStatus.ACTIVE);
    await expect(f.service.settleDebtWithSavedCard(7, 'admin', [1], '1234567890123456'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(f.provider.submitCharge).not.toHaveBeenCalled();
  });

  it('creates a VAT-inclusive one-off attempt and finalizes without subscription activation', async () => {
    const f = fixture(SubscriptionStatus.ACTIVE);
    const result = await f.service.createOneOffCharge(7, 'admin', {
      requestId: 'a41a2fe5-b849-4ab4-8c93-13d67f57c744',
      amountAgorot: 1180,
      description: 'Additional service',
      consentEvidence: 'Customer approved by email',
    });
    expect(f.orchestration.createOrGetAttempt).toHaveBeenCalledWith(expect.objectContaining({
      amountAgorot: 1180,
      amountBeforeVatAgorot: 1000,
      vatAmountAgorot: 180,
      requestId: 'a41a2fe5-b849-4ab4-8c93-13d67f57c744',
    }));
    expect(f.lifecycle.resumeCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.resumeCapturedAttempt.mock.calls[0][0]).not.toHaveProperty('activate');
    expect(f.renewal.completeCapturedAttempt).not.toHaveBeenCalled();
    expect(result.status).toBe('CHARGED');
  });
});

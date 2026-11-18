jest.mock('../utils/billing-token-encryption.util', () => ({
  decryptCardcomToken: jest.fn(() => 'decrypted-token'),
}));

import { decryptCardcomToken } from '../utils/billing-token-encryption.util';
import { BillingPreSubmissionFailureReason as R } from './billing-attempt-orchestration.service';
import { BillingChargeMode } from '../enums/billing.enums';
import { BillingCardcomExecutorService } from './billing-cardcom-executor.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';

describe('BillingCardcomExecutorService', () => {
  const hostedRequest = {
    attemptId: 4,
    paymentMethodId: null,
    externalUniqTranId: 'checkout:4',
    amountAgorot: 1170,
    currency: 'ILS',
    chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
    lowProfileId: 'lp-4',
    planId: 2,
    firebaseId: 'owner',
    subscriptionId: 7,
  };
  const hostedReturnValue = JSON.stringify({
    intent: 'CHECKOUT',
    firebaseId: 'owner',
    subscriptionId: 7,
    planId: 2,
    billingAttemptId: 4,
  });

  function hostedExecutor(result: Record<string, unknown>) {
    return new BillingCardcomExecutorService(
      {
        getLowProfileResult: jest.fn().mockResolvedValue(result),
        getApiCredentials: jest.fn().mockReturnValue({ terminalNumber: 1000 }),
      } as any,
      { findOne: jest.fn() } as any,
    );
  }

  it('releases a hosted page only for a correlated terminal non-success result', async () => {
    const executor = hostedExecutor({
      ResponseCode: 10,
      Description: 'Payment page expired without a transaction',
      TerminalNumber: 1000,
      LowProfileId: 'lp-4',
      ReturnValue: hostedReturnValue,
    });

    await expect(executor.reconcileCharge(hostedRequest)).resolves.toEqual({
      success: false,
      responseCode: 10,
      failureCategory: 'HOSTED_NOT_SUCCESSFUL',
      providerDescription: 'Payment page expired without a transaction',
      definitiveDecline: true,
    });
  });

  it.each([
    [
      'an uncorrelated provider error',
      {
        ResponseCode: 603,
        Description: 'Invalid API credentials',
      },
      603,
      'Invalid API credentials',
    ],
    [
      'a foreign LowProfile result',
      {
        ResponseCode: 10,
        Description: 'Payment page expired',
        TerminalNumber: 1000,
        LowProfileId: 'lp-other',
        ReturnValue: hostedReturnValue,
      },
      10,
      'Payment page expired',
    ],
    [
      'a conflicting transaction-bearing result',
      {
        ResponseCode: 10,
        Description: 'Conflicting result',
        TerminalNumber: 1000,
        LowProfileId: 'lp-4',
        ReturnValue: hostedReturnValue,
        TranzactionId: 991,
      },
      10,
      'Conflicting result',
    ],
  ])('keeps %s unresolved while preserving sanitized diagnostics', async (
    _name,
    result,
    responseCode,
    providerDescription,
  ) => {
    const executor = hostedExecutor(result);

    await expect(executor.reconcileCharge(hostedRequest)).resolves.toEqual({
      success: false,
      responseCode,
      failureCategory: 'HOSTED_RESULT_NOT_SUCCESSFUL',
      providerDescription,
    });
  });

  it('delegates captured token charges without exposing the token in the request contract', async () => {
    const cardcom = {
      chargeByToken: jest.fn().mockResolvedValue({
        ResponseCode: 0,
        TranzactionId: 77,
        ApprovalNumber: 'approval-77',
      }),
    };
    const paymentMethodRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 8,
        cardcomToken: 'encrypted-token',
        cardExpiryMonth: 9,
        cardExpiryYear: 2027,
      }),
    };
    const service = new BillingCardcomExecutorService(
      cardcom as any,
      paymentMethodRepository as any,
    );

    await expect(
      service.executeCharge({
        attemptId: 4,
        paymentMethodId: 8,
        externalUniqTranId: 'renewal:4:2026-09',
        amountAgorot: 1170,
        currency: 'ILS',
      }),
    ).resolves.toEqual({
      success: true,
      responseCode: 0,
      transactionId: '77',
      terminalRef: 'approval-77',
      failureCategory: null,
    });
    expect(cardcom.chargeByToken).toHaveBeenCalledWith({
      token: 'decrypted-token',
      cardExpirationMMYY: '0927',
      amountAgorot: 1170,
      externalUniqTranId: 'renewal:4:2026-09',
    });
  });

  const CARD = {
    id: 8,
    cardcomToken: 'encrypted-token',
    cardExpiryMonth: 9,
    cardExpiryYear: 2099,
  };
  it.each([
    ['no payment method', null, R.NO_PAYMENT_METHOD],
    ['no stored token', { ...CARD, cardcomToken: '' }, R.NO_STORED_TOKEN],
    [
      'missing card expiry',
      { ...CARD, cardExpiryMonth: null },
      R.CARD_EXPIRY_MISSING,
    ],
    ['an expired card', { ...CARD, cardExpiryYear: 2020 }, R.CARD_EXPIRED],
    ['an undecryptable token', CARD, R.TOKEN_DECRYPTION_FAILED],
  ])(
    '%s fails locally with a typed reason: no CardCom request and never UNKNOWN',
    async (_name, paymentMethod, reason) => {
      if (reason === R.TOKEN_DECRYPTION_FAILED) {
        (decryptCardcomToken as jest.Mock).mockImplementationOnce(() => {
          throw new Error('bad decrypt');
        });
      }
      const cardcom = {
        chargeByToken: jest.fn(),
        getTransactionByExternalUniqTran: jest.fn(),
      };
      const executor = new BillingCardcomExecutorService(
        cardcom as any,
        { findOne: jest.fn().mockResolvedValue(paymentMethod) } as any,
      );
      const attempt = {
        id: 4,
        paymentMethodId: 8,
        cardcomExternalUniqTranId: 'renewal:4:2026-09',
        amountAgorot: 1170,
        currency: 'ILS',
        stateVersion: 2,
      };
      const orchestration = {
        assertOwnerMutation: jest.fn(),
        claimForSubmission: jest
          .fn()
          .mockResolvedValue({ claimed: true, attempt }),
        applyNormalizedOutcome: jest.fn(),
        applyPreSubmissionFailure: jest.fn().mockResolvedValue(attempt),
      };
      const runtime = new BillingProviderRuntimeService(
        orchestration as any,
        executor,
      );

      const result = await runtime.submitCharge({
        actor: { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' },
        attemptId: 4,
        expectedStateVersion: 2,
        leaseOwner: 'renewal-4',
      });

      expect(result).toEqual({
        kind: 'LOCAL_FAILURE',
        reason,
        disposition:
          reason === R.TOKEN_DECRYPTION_FAILED
            ? 'SYSTEM_ACTION'
            : 'CUSTOMER_ACTION',
        attempt,
      });
      expect(orchestration.applyPreSubmissionFailure).toHaveBeenCalledWith(
        4,
        'renewal-4',
        2,
        reason,
      );
      expect(orchestration.applyNormalizedOutcome).not.toHaveBeenCalled();
      expect(cardcom.chargeByToken).not.toHaveBeenCalled();
      expect(cardcom.getTransactionByExternalUniqTran).not.toHaveBeenCalled();
    },
  );
});

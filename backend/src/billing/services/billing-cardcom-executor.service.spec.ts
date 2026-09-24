jest.mock('../utils/billing-token-encryption.util', () => ({
  decryptCardcomToken: jest.fn(() => 'decrypted-token'),
}));

import { decryptCardcomToken } from '../utils/billing-token-encryption.util';
import { BillingPreSubmissionFailureReason as R } from './billing-attempt-orchestration.service';
import { BillingCardcomExecutorService } from './billing-cardcom-executor.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';

describe('BillingCardcomExecutorService', () => {
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

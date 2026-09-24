jest.mock('../utils/billing-token-encryption.util', () => ({
  decryptCardcomToken: jest.fn(() => 'decrypted-token'),
}));

import { PRE_SUBMISSION_LOCAL_FAILURE } from './billing-attempt-orchestration.service';
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

  it.each([
    ['is missing', null],
    ['has no expiry', { id: 8, cardcomToken: 'encrypted-token' }],
  ])(
    'a payment method that %s fails before any CardCom request and is not an uncertain charge',
    async (_name, paymentMethod) => {
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
        applyNormalizedOutcome: jest.fn().mockResolvedValue(attempt),
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

      expect(result).toEqual(
        expect.objectContaining({
          outcome: {
            kind: 'UNKNOWN',
            failureCategory: PRE_SUBMISSION_LOCAL_FAILURE,
          },
        }),
      );
      expect(cardcom.chargeByToken).not.toHaveBeenCalled();
      // Read-only reconciliation never selects it, so it can never be looked up.
      expect(cardcom.getTransactionByExternalUniqTran).not.toHaveBeenCalled();
    },
  );
});

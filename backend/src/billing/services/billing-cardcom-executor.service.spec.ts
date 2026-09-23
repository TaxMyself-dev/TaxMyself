jest.mock('../utils/billing-token-encryption.util', () => ({
  decryptCardcomToken: jest.fn(() => 'decrypted-token'),
}));

import { BillingCardcomExecutorService } from './billing-cardcom-executor.service';

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

  it('never replays a token charge for reconciliation', async () => {
    const service = new BillingCardcomExecutorService(
      { chargeByToken: jest.fn() } as any,
      {} as any,
    );
    await expect(
      service.reconcileCharge({
        attemptId: 4,
        paymentMethodId: 8,
        externalUniqTranId: 'renewal:4:2026-09',
        amountAgorot: 1170,
        currency: 'ILS',
      }),
    ).rejects.toThrow('reconciliation is not available');
  });
});

import { BillingAttemptStatus } from '../enums/billing.enums';
import {
  BillingProviderRuntimeService,
  normalizeCardComCharge,
} from './billing-provider-runtime.service';

describe('BillingProviderRuntimeService', () => {
  const actor = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  const attempt = {
    id: 4,
    paymentMethodId: 8,
    cardcomExternalUniqTranId: 'renewal:4:2026-09',
    amountAgorot: 1170,
    currency: 'ILS',
    stateVersion: 2,
  };

  it.each([
    [
      'captured',
      { success: true, responseCode: 0, transactionId: 'tx-4' },
      {
        kind: 'CAPTURED',
        cardcomTransactionId: 'tx-4',
        providerTerminalRef: null,
        providerResponseCode: 0,
      },
    ],
    [
      'declined',
      { success: false, responseCode: 51 },
      {
        kind: 'DECLINED',
        providerResponseCode: 51,
        failureCategory: 'PROVIDER_DECLINED',
      },
    ],
  ])('normalizes %s deterministically', (_name, response, expected) => {
    expect(normalizeCardComCharge(response as any)).toEqual(expected);
  });

  it('maps executor transport failure to UNKNOWN and never retries the charge', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      claimForSubmission: jest.fn().mockResolvedValue({
        claimed: true,
        attempt,
      }),
      applyNormalizedOutcome: jest.fn().mockResolvedValue({
        ...attempt,
        status: BillingAttemptStatus.UNKNOWN,
      }),
    };
    const executor = {
      executeCharge: jest.fn().mockRejectedValue(new Error('timeout')),
      reconcileCharge: jest.fn(),
    };
    const service = new BillingProviderRuntimeService(
      orchestration as any,
      executor as any,
    );

    const result = await service.submitCharge({
      actor,
      attemptId: 4,
      expectedStateVersion: 2,
      leaseOwner: 'renewal-4',
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'APPLIED',
        outcome: { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' },
      }),
    );
    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
  });

  it('sanitizes executor errors before they reach the normalized outcome', async () => {
    const sensitiveError = new Error(
      'CardCom rejected token=4111111111111111 rawResponse={"ApiName":"secret-api-key"}',
    );
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      claimForSubmission: jest.fn().mockResolvedValue({
        claimed: true,
        attempt,
      }),
      applyNormalizedOutcome: jest
        .fn()
        .mockImplementation((_id, _owner, _version, outcome) => ({
          ...attempt,
          status: BillingAttemptStatus.UNKNOWN,
          ...outcome,
        })),
    };
    const executor = {
      executeCharge: jest.fn().mockRejectedValue(sensitiveError),
      reconcileCharge: jest.fn(),
    };
    const service = new BillingProviderRuntimeService(
      orchestration as any,
      executor as any,
    );

    const result = await service.submitCharge({
      actor,
      attemptId: 4,
      expectedStateVersion: 2,
      leaseOwner: 'renewal-4',
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'APPLIED',
        outcome: { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' },
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('secret-api-key');
  });

  it('stops an idempotent replay before provider I/O', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      claimForSubmission: jest.fn().mockResolvedValue({
        claimed: false,
        reason: 'NOT_CLAIMABLE',
        attempt,
      }),
    };
    const executor = { executeCharge: jest.fn(), reconcileCharge: jest.fn() };
    const service = new BillingProviderRuntimeService(
      orchestration as any,
      executor as any,
    );

    const result = await service.submitCharge({
      actor,
      attemptId: 4,
      expectedStateVersion: 2,
      leaseOwner: 'renewal-4',
    });

    expect(result.kind).toBe('NOT_CLAIMED');
    expect(executor.executeCharge).not.toHaveBeenCalled();
  });
});

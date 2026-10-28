import { BillingCompletionRecoveryService } from './billing-completion-recovery.service';
import { BillingChargeMode } from '../enums/billing.enums';

describe('BillingCompletionRecoveryService', () => {
  function build() {
    const orchestration = { findDueCapturedAttempts: jest.fn().mockResolvedValue([]) };
    const hosted = { completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    const renewal = { completeCapturedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    const service = new BillingCompletionRecoveryService(orchestration as any, hosted as any, renewal as any);
    return { service, orchestration, hosted, renewal };
  }

  it('completes the exact token or hosted capture independently of the renewal due-date selector', async () => {
    const { service, orchestration, hosted, renewal } = build();
    const now = new Date('2026-10-28T01:02:00Z');
    orchestration.findDueCapturedAttempts.mockResolvedValue([
      { attemptId: 3, subscriptionId: 52, firebaseId: 'owner', chargeMode: BillingChargeMode.TOKEN_TRANSACTION },
      { attemptId: 4, subscriptionId: 53, firebaseId: 'other', chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED },
    ]);
    await service.recover(now);
    expect(orchestration.findDueCapturedAttempts).toHaveBeenCalledWith(now, 20);
    expect(renewal.completeCapturedAttempt).toHaveBeenCalledWith(3, true);
    expect(hosted.completeCapturedHostedAttempt).toHaveBeenCalledWith({
      billingAttemptId: 4, subscriptionId: 53, firebaseId: 'other', scheduledOnly: true,
    });
  });

  it('one failed row does not block another capture or the next sweep', async () => {
    const { service, orchestration, renewal } = build();
    orchestration.findDueCapturedAttempts.mockResolvedValue([{ attemptId: 3 }, { attemptId: 5 }]);
    renewal.completeCapturedAttempt.mockRejectedValueOnce(new Error('local failure'));
    await service.recover();
    expect(renewal.completeCapturedAttempt.mock.calls).toEqual([[3, true], [5, true]]);
    await service.recover();
    expect(renewal.completeCapturedAttempt).toHaveBeenCalledTimes(4);
  });

  it('does not overlap sweeps in the same process and releases the guard after list failure', async () => {
    const { service, orchestration } = build();
    let release!: (value: unknown[]) => void;
    orchestration.findDueCapturedAttempts.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = service.recover();
    await service.recover();
    expect(orchestration.findDueCapturedAttempts).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    orchestration.findDueCapturedAttempts.mockRejectedValueOnce(new Error('database unavailable'));
    await service.recover();
    await service.recover();
    expect(orchestration.findDueCapturedAttempts).toHaveBeenCalledTimes(3);
  });
});

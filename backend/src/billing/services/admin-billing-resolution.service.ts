import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResolveBillingAttemptDto } from '../dtos/admin/resolve-billing-attempt.dto';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingAttemptStatus, BillingChargeMode } from '../enums/billing.enums';
import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

@Injectable()
export class AdminBillingResolutionService {
  constructor(private readonly dataSource: DataSource,
    private readonly orchestration: BillingAttemptOrchestrationService,
    private readonly provider: BillingProviderRuntimeService,
    private readonly hosted: BillingHostedCompletionService,
    private readonly renewal: SubscriptionRenewalService) {}

  async resolve(subscriptionId: number, attemptId: number, actorFirebaseId: string, dto: ResolveBillingAttemptDto) {
    let attempt = await this.orchestration.prepareAdminResolution(subscriptionId, attemptId, actorFirebaseId, dto);
    const debt = await this.dataSource.manager.findOneByOrFail(BillingObligation, { id: attempt.obligationId });
    if (dto.action === 'CHECK_PROVIDER') {
      const result = await this.provider.reconcileCharge({
        actor: { actorFirebaseId: debt.firebaseIdSnapshot, subjectFirebaseId: debt.firebaseIdSnapshot },
        subscriptionId, attemptId, expectedStateVersion: attempt.stateVersion,
        leaseOwner: `admin-check-${attemptId}`,
      });
      if (result.kind === 'NOT_CLAIMED') throw new ConflictException('Another process is checking this attempt; refresh');
      attempt = result.attempt as BillingAttempt;
    }
    let completion: string | null = null;
    if (attempt.status === BillingAttemptStatus.CAPTURED) {
      completion = attempt.chargeMode === BillingChargeMode.LOW_PROFILE_HOSTED
        ? await this.hosted.completeCapturedHostedAttempt({
            firebaseId: debt.firebaseIdSnapshot, subscriptionId, billingAttemptId: attempt.id,
          })
        : await this.renewal.completeCapturedAttempt(attempt.id);
    }
    const current = await this.dataSource.manager.findOneByOrFail(BillingAttempt, { id: attemptId });
    return { attemptId, status: current.status, stateVersion: current.stateVersion, completion };
  }
}

import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, HttpCode, Injectable, Optional, Post, UseGuards } from '@nestjs/common';
import { BillingTasksService, CompletionTaskKind } from './services/billing-tasks.service';
import { BillingCompletionRecoveryService } from './services/billing-completion-recovery.service';
import { SubscriptionRenewalService } from './services/subscription-renewal.service';
import { BillingReconciliationService } from './services/billing-reconciliation.service';

@Injectable()
export class BillingTaskGuard implements CanActivate {
  constructor(private readonly tasks: BillingTasksService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest().headers?.authorization;
    if (!await this.tasks.verifyAuthorization(header)) throw new ForbiddenException('Invalid billing task identity');
    return true;
  }
}

@Injectable()
export class BillingChargeTaskGuard implements CanActivate {
  constructor(private readonly tasks: BillingTasksService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest().headers?.authorization;
    if (!await this.tasks.verifyAuthorization(header, 'CHARGE')) {
      throw new ForbiddenException('Invalid billing charge task identity');
    }
    return true;
  }
}

@Controller('internal/billing')
export class BillingTaskController {
  constructor(
    private readonly completion: BillingCompletionRecoveryService,
    @Optional() private readonly renewals?: SubscriptionRenewalService,
    @Optional() private readonly tasks?: BillingTasksService,
    @Optional() private readonly reconciliation?: BillingReconciliationService,
  ) {}
  /** Invoked once daily by authenticated Cloud Scheduler, also when Cloud Run is idle. */
  @Post('repair')
  @UseGuards(BillingTaskGuard)
  @HttpCode(204)
  async repair(): Promise<void> { await this.completion.recover(); }

  @Post('completion')
  @UseGuards(BillingTaskGuard)
  @HttpCode(204)
  async complete(@Body() body: unknown): Promise<void> {
    const input = body as { kind?: CompletionTaskKind; id?: number };
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['kind', 'id'].includes(key)) ||
      !['CAPTURE', 'MAIL'].includes(input.kind) || !Number.isSafeInteger(input.id) || input.id < 1) {
      throw new BadRequestException('Invalid billing completion task');
    }
    await this.completion.handle(input.kind, input.id);
  }

  @Post('charge')
  @UseGuards(BillingChargeTaskGuard)
  @HttpCode(204)
  async charge(@Body() body: unknown): Promise<void> {
    const input = body as { subscriptionId?: number };
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => key !== 'subscriptionId') ||
      !Number.isSafeInteger(input.subscriptionId) || input.subscriptionId! < 1) {
      throw new BadRequestException('Invalid billing charge task');
    }
    const result = await this.renewals!.processSubscriptionById(input.subscriptionId!);
    if (result.outcome === 'error') throw new Error('Billing charge task failed');
  }

  @Post('charge-repair')
  @UseGuards(BillingChargeTaskGuard)
  @HttpCode(204)
  async repairCharges(): Promise<void> {
    const result = await this.tasks!.repairChargeTasks();
    if (result.enqueued < result.found) {
      throw new Error('Some billing charge retries were not enqueued');
    }
  }

  @Post('reconcile')
  @UseGuards(BillingTaskGuard)
  @HttpCode(204)
  async reconcile(): Promise<void> {
    const result = await this.reconciliation!.reconcileDueAttempts();
    if (result.errors > 0) throw new Error('Billing reconciliation had errors');
  }
}

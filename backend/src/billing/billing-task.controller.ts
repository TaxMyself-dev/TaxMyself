import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, HttpCode, Injectable, Post, UseGuards } from '@nestjs/common';
import { BillingTasksService, CompletionTaskKind } from './services/billing-tasks.service';
import { BillingCompletionRecoveryService } from './services/billing-completion-recovery.service';

@Injectable()
export class BillingTaskGuard implements CanActivate {
  constructor(private readonly tasks: BillingTasksService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest().headers?.authorization;
    if (!await this.tasks.verifyAuthorization(header)) throw new ForbiddenException('Invalid billing task identity');
    return true;
  }
}

@Controller('internal/billing')
@UseGuards(BillingTaskGuard)
export class BillingTaskController {
  constructor(private readonly completion: BillingCompletionRecoveryService) {}
  /** Invoked once daily by authenticated Cloud Scheduler, also when Cloud Run is idle. */
  @Post('repair')
  @HttpCode(204)
  async repair(): Promise<void> { await this.completion.recover(); }

  @Post('completion')
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
}

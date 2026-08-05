import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { Reflector } from '@nestjs/core';
import { BillingService } from 'src/billing/services/billing.service';
import { ModuleName } from 'src/enum';
import { REQUIRE_MODULE_KEY } from 'src/decorators/require-module.decorator';


@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const firebaseId = request.user?.firebaseId;

    if (!firebaseId) {
      throw new ForbiddenException('Missing user ID in request context');
    }

    const requiredModule = this.reflector.getAllAndOverride<ModuleName>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) return true;

    const hasAccess = await this.billingService.hasModuleAccess(firebaseId, requiredModule);

    if (!hasAccess) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'MODULE_ACCESS_REQUIRED',
        module: requiredModule,
        message: 'Access to this module is not included in the current subscription.',
      });
    }

    return true;
  }
}
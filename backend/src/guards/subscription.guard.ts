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

    const requiredModule = this.reflector.get<ModuleName>('requiredModule', context.getHandler());

    if (!requiredModule) return true;

    const hasAccess = await this.billingService.hasModuleAccess(firebaseId, requiredModule);

    if (!hasAccess) {
      throw new ForbiddenException('No access to this module');
    }

    return true;
  }
}
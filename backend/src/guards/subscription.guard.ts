import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { Reflector } from '@nestjs/core';
import { UsersService } from 'src/users/users.service';
import { PayStatus, ModuleName } from 'src/enum';


@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const firebaseId = request.user?.firebaseId;

    if (!firebaseId) {
      throw new ForbiddenException('Missing user ID in request context');
    }

    const requiredModule = this.reflector.get<ModuleName>('requiredModule', context.getHandler());
    console.log("requiredModule is ", requiredModule);

    if (!requiredModule) return true;

    const user = await this.usersService.findByFirebaseId(firebaseId);
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const allowedStatuses = [PayStatus.FREE, PayStatus.TRIAL, PayStatus.PAID];
    const isAllowed = allowedStatuses.includes(user.payStatus);

    const hasAccess = isAllowed && user.modulesAccess.includes(requiredModule);

    if (!hasAccess) {
      throw new ForbiddenException('No access to this module');
    }

    console.log("payment status", user.payStatus);
    console.log("hasAccess is ", hasAccess);

    return true;
  }
}
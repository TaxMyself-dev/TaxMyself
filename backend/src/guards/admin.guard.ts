import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!(await this.usersService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AgentDomainService } from './agent-domain.service';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
@Injectable()
export class AgentAdminGuard implements CanActivate {
  constructor(private readonly domain: AgentDomainService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.domain.assertAiAdmin({
      actorFirebaseId: req.user.actorFirebaseId ?? req.user.firebaseId,
    });
    return true;
  }
}

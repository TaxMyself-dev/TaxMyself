import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';

@Injectable()
export class WhatsappDevelopmentGuard implements CanActivate {
  constructor(private readonly config: WhatsappDevelopmentConfig) {}
  canActivate(context: ExecutionContext): boolean {
    this.config.authorize(context.switchToHttp().getRequest().headers['x-whatsapp-dev-token']);
    return true;
  }
}

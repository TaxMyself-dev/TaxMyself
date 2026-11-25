import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { capacityProfile } from './document-ai.capacity';
import { schedulerDispatch } from './document-ai.execution';

export const DOCUMENT_SCHEDULER_IDENTITY = Symbol(
  'DOCUMENT_SCHEDULER_IDENTITY',
);
export interface SchedulerIdentity {
  verify(token: string, audience: string): Promise<Record<string, any>>;
}
@Injectable()
export class DocumentSchedulerGuard implements CanActivate, OnModuleInit {
  private readonly identity: SchedulerIdentity;
  constructor(
    @Optional()
    @Inject(DOCUMENT_SCHEDULER_IDENTITY)
    identity?: SchedulerIdentity,
  ) {
    let client: any;
    this.identity = identity || {
      verify: async (idToken, audience) => {
        const { google } = require('googleapis');
        client ||= new google.auth.OAuth2();
        const ticket = await client.verifyIdToken({ idToken, audience });
        return ticket.getPayload() || {};
      },
    };
  }
  configuration() {
    const audience = process.env.DOCUMENT_AI_SCHEDULER_AUDIENCE || '';
    const email = process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT || '';
    const sub = process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB || '';
    if (
      !audience.startsWith('https://') ||
      new URL(audience).origin !== audience ||
      !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(
        email,
      ) ||
      !/^\d{10,30}$/.test(sub)
    )
      throw new Error(
        'Document Scheduler requires exact service URL and service-account email/unique ID',
      );
    return { audience, email, sub };
  }
  onModuleInit() {
    const mode = process.env.DOCUMENT_AI_DISPATCH_MODE;
    if (mode && !['cron', 'scheduler'].includes(mode))
      throw new Error('Invalid DOCUMENT_AI_DISPATCH_MODE');
    if (schedulerDispatch()) {
      this.configuration();
      capacityProfile();
    }
  }
  protected dispatchEnabled(): boolean { return schedulerDispatch(); }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest().headers.authorization;
    if (
      !this.dispatchEnabled() ||
      typeof header !== 'string' ||
      !/^Bearer [^ ]+$/.test(header)
    )
      throw new UnauthorizedException();
    try {
      const { audience, email, sub } = this.configuration();
      const claims = await this.identity.verify(header.slice(7), audience);
      if (
        claims.aud === audience &&
        claims.email === email &&
        claims.sub === sub &&
        claims.email_verified === true &&
        ['accounts.google.com', 'https://accounts.google.com'].includes(
          claims.iss,
        ) &&
        typeof claims.exp === 'number' &&
        claims.exp * 1000 > Date.now()
      )
        return true;
    } catch {
      /* Fail closed, without token/claim logging. */
    }
    throw new UnauthorizedException();
  }
}

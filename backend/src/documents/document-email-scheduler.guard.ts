import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  DocumentSchedulerGuard,
  DOCUMENT_SCHEDULER_IDENTITY,
  SchedulerIdentity,
} from '../document-ai/document-ai-scheduler.guard';

/** Same OIDC identity policy, with email activation independent of AI dispatch. */
@Injectable()
export class DocumentEmailSchedulerGuard extends DocumentSchedulerGuard {
  constructor(
    @Optional()
    @Inject(DOCUMENT_SCHEDULER_IDENTITY)
    identity?: SchedulerIdentity,
  ) {
    super(identity);
  }
  protected dispatchEnabled(): boolean {
    return (
      process.env.DOCUMENT_EMAIL_QUEUE_ENABLED === 'true' &&
      process.env.DOCUMENT_EMAIL_QUEUE_RUNNER === 'scheduler'
    );
  }
  onModuleInit() {
    if (this.dispatchEnabled()) this.configuration();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ReportWorkflow } from 'src/report-workflow/report-workflow.entity';

/**
 * Notification side-channel for client/accountant collaboration events.
 *
 * V1 contract: every method is fire-and-forget — never throws.
 * Implementation in V1 just logs. WhatsApp / email / in-app channels
 * plug in here later without touching workflow service code.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async notifyClientWorkflowCreated(p: {
    workflow: ReportWorkflow;
  }): Promise<void> {
    this.logger.log(
      `[notify] client=${p.workflow.clientFirebaseId} business=${p.workflow.businessNumber} ` +
        `new ${p.workflow.type} workflow ${p.workflow.id} (period ${this.iso(p.workflow.periodStart)}–${this.iso(p.workflow.periodEnd)})`,
    );
  }

  async notifyAccountantWorkflowReady(p: {
    workflow: ReportWorkflow;
  }): Promise<void> {
    this.logger.log(
      `[notify] business=${p.workflow.businessNumber} ${p.workflow.type} workflow ${p.workflow.id} ` +
        `is READY_TO_PREPARE — accountant should be informed`,
    );
  }

  async notifyClientWorkflowReported(p: {
    workflow: ReportWorkflow;
  }): Promise<void> {
    this.logger.log(
      `[notify] client=${p.workflow.clientFirebaseId} workflow ${p.workflow.id} reported (${p.workflow.reportedSource})`,
    );
  }

  private iso(d: Date | string | null): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toISOString().slice(0, 10);
  }
}

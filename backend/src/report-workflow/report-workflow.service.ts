import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReportedSource,
  ReportWorkflow,
  ReportWorkflowStatus,
  ReportWorkflowType,
} from './report-workflow.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import {
  AccountantTask,
  TaskType,
} from 'src/accountant-tasks/accountant-task.entity';
import { ListWorkflowsDto } from './dtos/list-workflows.dto';
import { NotificationService } from 'src/notifications/notification.service';
import { TasksGeneratorService } from 'src/accountant-tasks/tasks-generator.service';

/**
 * Workflow as exposed to the API: the entity plus a derived flag telling the
 * frontend whether the current actor (a client) can self-mark the workflow as
 * reported (true when no accountant has an active delegation for this client).
 */
export interface ReportWorkflowResponse extends ReportWorkflow {
  canSelfMark: boolean;
}

@Injectable()
export class ReportWorkflowService {
  constructor(
    @InjectRepository(ReportWorkflow)
    private readonly workflowRepo: Repository<ReportWorkflow>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(AccountantTask)
    private readonly taskRepo: Repository<AccountantTask>,
    private readonly notifications: NotificationService,
    private readonly tasksGenerator: TasksGeneratorService,
  ) {}

  // ----- Client-side -----

  /**
   * List the requesting client's workflows. Triggers on-demand generation first
   * so the list reflects the freshest period bounds without depending on a daily cron.
   */
  async listForClient(
    clientFirebaseId: string,
    query: ListWorkflowsDto,
  ): Promise<ReportWorkflowResponse[]> {
    // Refresh state on entry. Errors here must not block the list.
    try {
      await this.tasksGenerator.generateForUser(clientFirebaseId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('generateForUser failed:', err?.message ?? err);
    }

    const where: Record<string, unknown> = { clientFirebaseId };
    if (query.status) where.status = query.status;
    if (query.businessNumber) where.businessNumber = query.businessNumber;
    const rows = await this.workflowRepo.find({
      where,
      order: { periodEnd: 'DESC', id: 'DESC' },
    });

    const canSelfMark = !(await this.hasAccountant(clientFirebaseId));
    return rows.map((w) => ({ ...w, canSelfMark }));
  }

  async getById(
    requesterFirebaseId: string,
    id: number,
  ): Promise<ReportWorkflowResponse> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('המשימה לא נמצאה');
    await this.assertAccess(requesterFirebaseId, workflow);
    const canSelfMark = !(await this.hasAccountant(workflow.clientFirebaseId));
    return { ...workflow, canSelfMark };
  }

  /** Client confirms they uploaded everything. Only allowed from WAITING_FOR_CLIENT. */
  async confirm(clientFirebaseId: string, id: number): Promise<ReportWorkflowResponse> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('המשימה לא נמצאה');
    if (workflow.clientFirebaseId !== clientFirebaseId) {
      throw new ForbiddenException('אין לך הרשאה למשימה זו');
    }
    if (workflow.status !== ReportWorkflowStatus.WAITING_FOR_CLIENT) {
      throw new BadRequestException('לא ניתן לאשר במצב הזה');
    }

    workflow.status = ReportWorkflowStatus.READY_TO_PREPARE;
    workflow.clientConfirmedAt = new Date();
    workflow.clientConfirmedBy = clientFirebaseId;
    const saved = await this.workflowRepo.save(workflow);

    this.notifications.notifyAccountantWorkflowReady({ workflow: saved }).catch(() => {});
    const canSelfMark = !(await this.hasAccountant(saved.clientFirebaseId));
    return { ...saved, canSelfMark };
  }

  // ----- Accountant-side / programmatic / self-served -----

  /**
   * Set or unset REPORTED. Driven by:
   *  - the accountant manual click (MANUAL_ACCOUNTANT, actor = accountant firebaseId);
   *  - a future SHAAM webhook (SHAAM_WEBHOOK, actor = null);
   *  - the client themselves when they have no accountant (MANUAL_ACCOUNTANT,
   *    actor = client firebaseId — allowed only when no active delegation exists).
   */
  async setReported(params: {
    workflowId: number;
    reported: boolean;
    source: ReportedSource;
    actorFirebaseId: string | null;
  }): Promise<ReportWorkflowResponse> {
    const { workflowId, reported, source, actorFirebaseId } = params;
    const workflow = await this.workflowRepo.findOne({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException('המשימה לא נמצאה');

    if (source === ReportedSource.MANUAL_ACCOUNTANT) {
      if (!actorFirebaseId) throw new ForbiddenException('לא אותחל משתמש');
      await this.assertReportedActor(workflow, actorFirebaseId);
    }
    // SHAAM_WEBHOOK path is system-driven — no actor authorization here.

    if (reported) {
      if (workflow.status === ReportWorkflowStatus.REPORTED) {
        const canSelfMark = !(await this.hasAccountant(workflow.clientFirebaseId));
        return { ...workflow, canSelfMark };
      }
      if (workflow.status === ReportWorkflowStatus.WAITING_FOR_CLIENT) {
        // Bypass: record that the actor confirmed for the client out-of-band.
        workflow.clientConfirmedAt = new Date();
        workflow.clientConfirmedBy = `accountant-bypass:${actorFirebaseId ?? 'system'}`;
      }
      workflow.status = ReportWorkflowStatus.REPORTED;
      workflow.reportedAt = new Date();
      workflow.reportedByAccountantFirebaseId = actorFirebaseId;
      workflow.reportedSource = source;
    } else {
      if (workflow.status !== ReportWorkflowStatus.REPORTED) {
        throw new BadRequestException('הדוח אינו במצב מדווח');
      }
      workflow.status = ReportWorkflowStatus.READY_TO_PREPARE;
      workflow.reportedAt = null;
      workflow.reportedByAccountantFirebaseId = null;
      workflow.reportedSource = null;
    }
    const saved = await this.workflowRepo.save(workflow);

    await this.syncAccountantTasks(saved, reported);

    if (reported) {
      this.notifications.notifyClientWorkflowReported({ workflow: saved }).catch(() => {});
    }
    const canSelfMark = !(await this.hasAccountant(saved.clientFirebaseId));
    return { ...saved, canSelfMark };
  }

  // ----- Internal -----

  /**
   * Authorize the actor for setReported. Two valid paths:
   *   1. Actor has an active Delegation to this workflow's client (= the accountant).
   *   2. Actor IS the client AND the client has no active accountant delegation
   *      (= self-served bookkeeping).
   */
  private async assertReportedActor(
    workflow: ReportWorkflow,
    actorFirebaseId: string,
  ): Promise<void> {
    const accountantDelegation = await this.delegationRepo.findOne({
      where: {
        agentId: actorFirebaseId,
        userId: workflow.clientFirebaseId,
        status: DelegationStatus.ACTIVE,
      },
    });
    if (accountantDelegation) return;

    if (actorFirebaseId === workflow.clientFirebaseId) {
      const anyAccountant = await this.delegationRepo.findOne({
        where: {
          userId: workflow.clientFirebaseId,
          status: DelegationStatus.ACTIVE,
        },
      });
      if (anyAccountant) {
        throw new ForbiddenException('סימון "דווח" מבוצע על ידי רואה החשבון שלך');
      }
      return;
    }
    throw new ForbiddenException('אין הרשאה לסמן את הדוח');
  }

  private async assertAccess(
    requesterFirebaseId: string,
    workflow: ReportWorkflow,
  ): Promise<void> {
    if (requesterFirebaseId === workflow.clientFirebaseId) return;
    const delegation = await this.delegationRepo.findOne({
      where: {
        agentId: requesterFirebaseId,
        userId: workflow.clientFirebaseId,
        status: DelegationStatus.ACTIVE,
      },
    });
    if (!delegation) throw new ForbiddenException('אין גישה למשימה זו');
  }

  private async hasAccountant(clientFirebaseId: string): Promise<boolean> {
    const found = await this.delegationRepo.findOne({
      where: { userId: clientFirebaseId, status: DelegationStatus.ACTIVE },
    });
    return !!found;
  }

  /**
   * Mirror the AnnualReport pattern: when the workflow flips REPORTED state,
   * sync the matching AccountantTask rows so the accountant's משימות tab reflects it.
   */
  private async syncAccountantTasks(
    workflow: ReportWorkflow,
    reported: boolean,
  ): Promise<void> {
    const taskType =
      workflow.type === ReportWorkflowType.VAT_REPORT
        ? TaskType.VAT_REPORT
        : TaskType.ADVANCE_TAX;

    const tasks = await this.taskRepo.find({
      where: {
        businessNumber: workflow.businessNumber,
        type: taskType,
        periodStart: workflow.periodStart,
        periodEnd: workflow.periodEnd,
      },
    });
    for (const t of tasks) {
      if (t.isComplete === reported) continue;
      t.isComplete = reported;
      t.completedAt = reported ? new Date() : null;
      await this.taskRepo.save(t);
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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
import { ReportsService } from 'src/reports/reports.service';
import * as admin from 'firebase-admin';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { SharedService } from 'src/shared/shared.service';
import { BusinessType, ReportPeriodLabel, VATReportingType } from 'src/enum';

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
  private readonly logger = new Logger(ReportWorkflowService.name);

  constructor(
    @InjectRepository(ReportWorkflow)
    private readonly workflowRepo: Repository<ReportWorkflow>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(AccountantTask)
    private readonly taskRepo: Repository<AccountantTask>,
    @InjectRepository(SlimTransaction)
    private readonly slimRepo: Repository<SlimTransaction>,
    @InjectRepository(FullTransactionCache)
    private readonly cacheRepo: Repository<FullTransactionCache>,
    private readonly notifications: NotificationService,
    private readonly tasksGenerator: TasksGeneratorService,
    private readonly reportsService: ReportsService,
    private readonly sharedService: SharedService,
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

    const where: Record<string, unknown> = {
      clientFirebaseId,
      dismissedAt: IsNull(),
    };
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

  /**
   * Self-served client dismisses (soft-deletes) one of their workflows.
   * Allowed only when the actor *is* the workflow's client AND the client has
   * no active delegation — accountant-managed clients can't hide reporting
   * obligations from their accountant.
   *
   * The row stays in the DB so the unique index on (businessNumber, type,
   * periodStart, periodEnd) keeps the generator from recreating the same period.
   */
  async dismiss(clientFirebaseId: string, id: number): Promise<void> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('המשימה לא נמצאה');
    if (workflow.clientFirebaseId !== clientFirebaseId) {
      throw new ForbiddenException('אין לך הרשאה למשימה זו');
    }
    if (await this.hasAccountant(clientFirebaseId)) {
      throw new ForbiddenException('לא ניתן למחוק משימה כשיש רואה חשבון פעיל');
    }
    if (workflow.dismissedAt) return; // idempotent — already dismissed.
    workflow.dismissedAt = new Date();
    await this.workflowRepo.save(workflow);
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
        // Re-run the lock so a previous partial-failure can self-heal on retry.
        // The lock is idempotent — it only writes rows whose vatReportingDate IS NULL.
        await this.lockTransactionsIfApplicable(workflow);
        const canSelfMark = !(await this.hasAccountant(workflow.clientFirebaseId));
        return { ...workflow, canSelfMark };
      }
      if (workflow.status === ReportWorkflowStatus.WAITING_FOR_CLIENT) {
        // Bypass: record that the actor confirmed for the client out-of-band.
        // Self-served clients marking their own row aren't really "bypassed by
        // the accountant" — label accordingly so audit logs read true.
        workflow.clientConfirmedAt = new Date();
        const isSelfServed =
          actorFirebaseId !== null && actorFirebaseId === workflow.clientFirebaseId;
        workflow.clientConfirmedBy = isSelfServed
          ? `self-served:${actorFirebaseId}`
          : `accountant-bypass:${actorFirebaseId ?? 'system'}`;
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
      await this.lockTransactionsIfApplicable(saved);
    } else {
      await this.unlockTransactionsIfApplicable(saved);
    }

    if (reported) {
      this.notifications.notifyClientWorkflowReported({ workflow: saved }).catch(() => {});
      // Snapshot the as-filed VAT report as a PDF. Best-effort: a failure here
      // must not undo the submission the user just confirmed.
      if (
        saved.type === ReportWorkflowType.VAT_REPORT &&
        !saved.reportFilePath
      ) {
        try {
          await this.snapshotVatReportPdf(saved);
        } catch (err: any) {
          this.logger.error(
            `VAT report PDF snapshot failed for workflow ${saved.id}: ${err?.message ?? err}`,
          );
        }
      }
    } else {
      // Un-submitting clears the stale snapshot — the figures may change before
      // the next submission, so a regenerated file will replace it.
      if (saved.reportFilePath) {
        saved.reportFilePath = null;
        await this.workflowRepo.save(saved);
      }
    }
    const canSelfMark = !(await this.hasAccountant(saved.clientFirebaseId));
    return { ...saved, canSelfMark };
  }

  /**
   * Compute the VAT report for the workflow's business+period, render it to a
   * PDF, upload it to Firebase Storage, and persist the path on the workflow.
   */
  private async snapshotVatReportPdf(workflow: ReportWorkflow): Promise<void> {
    const pdf = await this.reportsService.generateVatReportPdfBuffer(
      workflow.clientFirebaseId,
      workflow.businessNumber,
      new Date(workflow.periodStart),
      new Date(workflow.periodEnd),
      workflow.reportedAt ? new Date(workflow.reportedAt) : new Date(),
    );

    const periodKey = `${this.dateKey(workflow.periodStart)}_${this.dateKey(workflow.periodEnd)}`;
    const storagePath = `reportFiles/${workflow.businessNumber}/VAT_REPORT/${periodKey}/vat-report-${workflow.id}.pdf`;

    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    await bucket.file(storagePath).save(pdf, {
      metadata: { contentType: 'application/pdf' },
      resumable: false,
    });

    workflow.reportFilePath = storagePath;
    await this.workflowRepo.save(workflow);
    this.logger.log(
      `VAT report PDF stored for workflow ${workflow.id} at ${storagePath}`,
    );
  }

  /** YYYY-MM-DD key for stable storage paths. */
  private dateKey(d: Date | string): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  /**
   * Fetch the stored report PDF for a workflow. Access is allowed to the
   * client themselves or an accountant with an active delegation (same rule
   * as getById). Returns the bytes + a download filename.
   */
  async getReportFile(
    requesterFirebaseId: string,
    id: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('המשימה לא נמצאה');
    await this.assertAccess(requesterFirebaseId, workflow);
    if (!workflow.reportFilePath) {
      throw new NotFoundException('לא נמצא קובץ דוח למשימה זו');
    }
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const [buffer] = await bucket.file(workflow.reportFilePath).download();
    const filename = `vat-report-${this.dateKey(workflow.periodStart)}-${this.dateKey(workflow.periodEnd)}.pdf`;
    return { buffer, filename };
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

  /**
   * On VAT report approval (accountant marks the workflow as reported):
   *   - For every VAT-eligible transaction in this business + period that
   *     is not already locked, ensure `vatReportingDate` is the period label
   *     (the user may have already confirmed → field already set; or not →
   *     stamp it now) and flip `isLocked = true` so the classification guard
   *     in TransactionProcessingService blocks further edits.
   *   - Mirror both fields onto full_transactions_cache for the read path.
   *
   * No-op for non-VAT workflows (e.g. ADVANCE_TAX), for businesses that don't
   * file VAT (EXEMPT or NOT_REQUIRED), and for transactions already locked.
   */
  private async lockTransactionsIfApplicable(
    workflow: ReportWorkflow,
  ): Promise<void> {
    const ctx = await this.resolveLockContext(workflow);
    if (!ctx) return;

    const ids = await this.findLockableExternalIds(workflow, ctx.includeNonVat);
    if (ids.length === 0) {
      this.logger.log(
        `lockTransactions: no eligible transactions for workflow ${workflow.id} (period ${ctx.periodLabel}).`,
      );
      return;
    }
    const filter = {
      userId: workflow.clientFirebaseId,
      externalTransactionId: In(ids),
      isLocked: false,
    } as const;
    const patch = { vatReportingDate: ctx.periodLabel, isLocked: true } as const;
    await this.slimRepo.update(filter, patch);
    await this.cacheRepo.update(filter, patch);
    this.logger.log(
      `lockTransactions: locked ${ids.length} transactions to period ${ctx.periodLabel} (workflow ${workflow.id}).`,
    );
  }

  /**
   * Reverse of lockTransactionsIfApplicable: clears the `isLocked` flag for
   * transactions locked by *this* workflow's period (matched by label).
   * Leaves `vatReportingDate` untouched so the period stamp still shows in
   * the תזרים table — only the lock icon disappears, and edits unblock.
   */
  private async unlockTransactionsIfApplicable(
    workflow: ReportWorkflow,
  ): Promise<void> {
    const ctx = await this.resolveLockContext(workflow);
    if (!ctx) return;

    const filter = {
      userId: workflow.clientFirebaseId,
      businessNumber: workflow.businessNumber,
      vatReportingDate: ctx.periodLabel,
    } as const;
    await this.slimRepo.update(filter, { isLocked: false });
    await this.cacheRepo.update(filter, { isLocked: false });
    this.logger.log(
      `unlockTransactions: cleared lock for period ${ctx.periodLabel} (workflow ${workflow.id}).`,
    );
  }

  /**
   * Returns the period label and per-row eligibility rule, or null when the
   * workflow doesn't lock anything (wrong type, business not filing VAT, etc.).
   */
  private async resolveLockContext(
    workflow: ReportWorkflow,
  ): Promise<{ periodLabel: ReportPeriodLabel; includeNonVat: false } | null> {
    if (workflow.type !== ReportWorkflowType.VAT_REPORT) return null;

    const business = await this.businessRepo.findOne({
      where: { businessNumber: workflow.businessNumber },
    });
    if (!business) return null;

    if (
      business.businessType !== BusinessType.LICENSED &&
      business.businessType !== BusinessType.COMPANY
    ) {
      return null;
    }
    if (
      business.vatReportingType !== VATReportingType.MONTHLY_REPORT &&
      business.vatReportingType !== VATReportingType.DUAL_MONTH_REPORT
    ) {
      return null;
    }

    const periodLabel = this.sharedService.getVATReportingDate(
      new Date(workflow.periodStart),
      business.vatReportingType,
    );
    if (!periodLabel) return null;

    return { periodLabel, includeNonVat: false };
  }

  /**
   * Finds externalTransactionIds for slim rows that are candidates for the VAT
   * lock: same business, transaction date in period, vatPercent > 0, and not
   * already locked. Joins through full_transactions_cache because slim itself
   * has no transactionDate column.
   */
  private async findLockableExternalIds(
    workflow: ReportWorkflow,
    _includeNonVat: false,
  ): Promise<string[]> {
    const rows = await this.slimRepo
      .createQueryBuilder('slim')
      .innerJoin(
        FullTransactionCache,
        'cache',
        'cache.userId = slim.userId AND cache.externalTransactionId = slim.externalTransactionId',
      )
      .select('slim.externalTransactionId', 'externalTransactionId')
      .where('slim.userId = :userId', { userId: workflow.clientFirebaseId })
      .andWhere('slim.businessNumber = :businessNumber', {
        businessNumber: workflow.businessNumber,
      })
      .andWhere('slim.vatPercent > 0')
      .andWhere('slim.isLocked = FALSE')
      .andWhere('cache.transactionDate BETWEEN :start AND :end', {
        start: workflow.periodStart,
        end: workflow.periodEnd,
      })
      .getRawMany<{ externalTransactionId: string }>();
    return rows.map((r) => r.externalTransactionId);
  }
}

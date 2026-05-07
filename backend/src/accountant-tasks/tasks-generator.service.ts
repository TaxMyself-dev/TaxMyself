import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountantTask, TaskSource, TaskType } from './accountant-task.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { SharedService } from 'src/shared/shared.service';
import { TaxReportingType, VATReportingType } from 'src/enum';
import {
  ReportWorkflow,
  ReportWorkflowStatus,
  ReportWorkflowType,
} from 'src/report-workflow/report-workflow.entity';
import { NotificationService } from 'src/notifications/notification.service';

export interface GenerationResult {
  created: number;
  skipped: number;
}

/** How many months of VAT/advance-tax periods to backfill at most. */
const PERIODIC_LOOKBACK_MONTHS = 12;
/** How many tax years of annual reports to backfill at most. */
const ANNUAL_LOOKBACK_YEARS = 5;

interface PeriodicPeriod {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  visibleFrom: Date;
  label: string;
}

interface AnnualPeriod {
  taxYear: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  visibleFrom: Date;
}

/**
 * Generates two related kinds of rows:
 *  - `report_workflow` rows (per business per period) — the source of truth for
 *    client↔accountant collaboration state. Created for **every** business with a
 *    reporting requirement, with or without an accountant delegation.
 *  - `accountant_task` rows — the accountant's todo list. Created only for
 *    businesses with an active delegation.
 *
 * Run on demand: each time the client opens their tasks page, or each time an
 * accountant opens the משימות tab. Idempotent — re-running creates no duplicates.
 */
@Injectable()
export class TasksGeneratorService {
  private readonly logger = new Logger(TasksGeneratorService.name);

  constructor(
    @InjectRepository(AccountantTask)
    private readonly tasksRepo: Repository<AccountantTask>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(ReportWorkflow)
    private readonly workflowRepo: Repository<ReportWorkflow>,
    private readonly sharedService: SharedService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Generate workflows for one user's businesses. Use case: client opens
   * /book-keeping/tasks. No AccountantTask rows created — that's the accountant's
   * concern.
   */
  async generateForUser(firebaseId: string, today: Date = new Date()): Promise<GenerationResult> {
    const todayUtc = this.toUtcDate(today);
    const result: GenerationResult = { created: 0, skipped: 0 };

    const businesses = await this.businessRepo.find({ where: { firebaseId } });
    for (const b of businesses) {
      await this.processBusinessWorkflows(b, todayUtc, result);
    }

    this.logger.log(
      `TasksGenerator (user ${firebaseId}): created=${result.created} skipped=${result.skipped}`,
    );
    return result;
  }

  /**
   * Generate workflows + AccountantTask rows for every business an accountant
   * has an active delegation to. Use case: accountant opens משימות tab.
   */
  async generateForAccountant(
    agentId: string,
    today: Date = new Date(),
  ): Promise<GenerationResult> {
    const todayUtc = this.toUtcDate(today);
    const result: GenerationResult = { created: 0, skipped: 0 };

    const delegations = await this.delegationRepo.find({
      where: { agentId, status: DelegationStatus.ACTIVE },
    });
    if (delegations.length === 0) return result;

    const userIds = Array.from(new Set(delegations.map((d) => d.userId)));
    const businesses = await this.businessRepo.find({ where: { firebaseId: In(userIds) } });
    const byUser = this.groupBusinessesByUser(businesses);

    for (const d of delegations) {
      const userBusinesses = byUser.get(d.userId) ?? [];
      for (const b of userBusinesses) {
        await this.processBusinessForDelegation(d, b, todayUtc, result);
      }
    }

    this.logger.log(
      `TasksGenerator (accountant ${agentId}): created=${result.created} skipped=${result.skipped}`,
    );
    return result;
  }

  /**
   * Run the full generation across every business + every active delegation.
   * Kept for the manual "רענן משימות אוטומטיות" button (and as a fallback if a
   * scheduled cron is wired in later). Not called by `handleDailyTask` anymore —
   * generation now happens lazily on tab entry.
   */
  async generateForToday(today: Date = new Date()): Promise<GenerationResult> {
    const todayUtc = this.toUtcDate(today);
    const result: GenerationResult = { created: 0, skipped: 0 };

    // Phase 1: every business with a reporting requirement → workflow.
    const allBusinesses = await this.businessRepo.find();
    for (const b of allBusinesses) {
      await this.processBusinessWorkflows(b, todayUtc, result);
    }

    // Phase 2: every active delegation → AccountantTask + annual.
    const delegations = await this.delegationRepo.find({
      where: { status: DelegationStatus.ACTIVE },
    });
    const userIds = Array.from(new Set(delegations.map((d) => d.userId)));
    const delegatedBusinesses = userIds.length
      ? await this.businessRepo.find({ where: { firebaseId: In(userIds) } })
      : [];
    const byUser = this.groupBusinessesByUser(delegatedBusinesses);

    for (const d of delegations) {
      const userBusinesses = byUser.get(d.userId) ?? [];
      for (const b of userBusinesses) {
        await this.processBusinessForDelegationTasksOnly(d, b, todayUtc, result);
      }
    }

    this.logger.log(
      `TasksGenerator (full): created=${result.created} skipped=${result.skipped}`,
    );
    return result;
  }

  /**
   * Backfill missing ReportWorkflow rows for existing periodic AccountantTask rows.
   * Idempotent — each upsert relies on the workflow's unique index.
   */
  async backfillWorkflows(): Promise<GenerationResult> {
    const result: GenerationResult = { created: 0, skipped: 0 };
    const tasks = await this.tasksRepo.find({
      where: [{ type: TaskType.VAT_REPORT }, { type: TaskType.ADVANCE_TAX }],
    });
    for (const t of tasks) {
      if (!t.businessNumber || !t.periodStart || !t.periodEnd) continue;
      const workflowType =
        t.type === TaskType.VAT_REPORT
          ? ReportWorkflowType.VAT_REPORT
          : ReportWorkflowType.ADVANCE_TAX;
      const out = await this.upsertWorkflow({
        clientFirebaseId: t.clientFirebaseId,
        businessNumber: t.businessNumber,
        type: workflowType,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
      });
      this.tally(out.outcome, result);
    }
    this.logger.log(
      `TasksGenerator backfill: created=${result.created} skipped=${result.skipped}`,
    );
    return result;
  }

  // ----- core: per-business processing -----

  /**
   * Workflow-only path (no AccountantTask creation). Used for:
   *  - clients without an accountant
   *  - the workflow side of the accountant flow (paired with `processBusinessForDelegation`)
   *  - the user-scoped on-entry call
   *
   * Walks every period from `business.createdAt` (capped to LOOKBACK months) up
   * to today. The unique index keeps re-runs idempotent so this is safe to call
   * on every tab entry.
   */
  private async processBusinessWorkflows(
    business: Business,
    today: Date,
    result: GenerationResult,
  ): Promise<void> {
    if (!business.businessNumber) return;
    const lowerBound = this.computeLowerBound(business, today);

    if (
      business.vatReportingType &&
      business.vatReportingType !== VATReportingType.NOT_REQUIRED
    ) {
      const periods = this.enumeratePeriodicPeriods(
        business.vatReportingType,
        lowerBound,
        today,
      );
      for (const period of periods) {
        const out = await this.upsertWorkflow({
          clientFirebaseId: business.firebaseId,
          businessNumber: business.businessNumber,
          type: ReportWorkflowType.VAT_REPORT,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });
        if (out.outcome === 'created' && out.workflow) {
          this.notifications
            .notifyClientWorkflowCreated({ workflow: out.workflow })
            .catch((e) => this.logger.warn(`notify failed: ${e?.message ?? e}`));
        }
        this.tally(out.outcome, result);
      }
    }

    if (
      business.taxReportingType &&
      business.taxReportingType !== TaxReportingType.NOT_REQUIRED
    ) {
      const periods = this.enumeratePeriodicPeriods(
        business.taxReportingType,
        lowerBound,
        today,
      );
      for (const period of periods) {
        const out = await this.upsertWorkflow({
          clientFirebaseId: business.firebaseId,
          businessNumber: business.businessNumber,
          type: ReportWorkflowType.ADVANCE_TAX,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });
        if (out.outcome === 'created' && out.workflow) {
          this.notifications
            .notifyClientWorkflowCreated({ workflow: out.workflow })
            .catch((e) => this.logger.warn(`notify failed: ${e?.message ?? e}`));
        }
        this.tally(out.outcome, result);
      }
    }
  }

  /**
   * Full delegation path: workflow + AccountantTask + annual.
   * Walks every period from the business's `createdAt` (capped to LOOKBACK).
   */
  private async processBusinessForDelegation(
    delegation: Delegation,
    business: Business,
    today: Date,
    result: GenerationResult,
  ): Promise<void> {
    if (!business.businessNumber) return;
    const lowerBound = this.computeLowerBound(business, today);

    if (
      business.vatReportingType &&
      business.vatReportingType !== VATReportingType.NOT_REQUIRED
    ) {
      const periods = this.enumeratePeriodicPeriods(
        business.vatReportingType,
        lowerBound,
        today,
      );
      for (const period of periods) {
        this.tally(
          await this.createPeriodicPair(delegation, business, TaskType.VAT_REPORT, period),
          result,
        );
      }
    }
    if (
      business.taxReportingType &&
      business.taxReportingType !== TaxReportingType.NOT_REQUIRED
    ) {
      const periods = this.enumeratePeriodicPeriods(
        business.taxReportingType,
        lowerBound,
        today,
      );
      for (const period of periods) {
        this.tally(
          await this.createPeriodicPair(delegation, business, TaskType.ADVANCE_TAX, period),
          result,
        );
      }
    }
    for (const annual of this.enumerateAnnualPeriods(lowerBound, today)) {
      this.tally(await this.createAnnualTask(delegation, business, annual), result);
    }
  }

  /**
   * Variant of `processBusinessForDelegation` that skips workflow creation —
   * the workflow has already been upserted by `processBusinessWorkflows` in the
   * full-generation phase. Used only by `generateForToday`.
   */
  private async processBusinessForDelegationTasksOnly(
    delegation: Delegation,
    business: Business,
    today: Date,
    result: GenerationResult,
  ): Promise<void> {
    if (!business.businessNumber) return;
    const lowerBound = this.computeLowerBound(business, today);

    if (
      business.vatReportingType &&
      business.vatReportingType !== VATReportingType.NOT_REQUIRED
    ) {
      for (const period of this.enumeratePeriodicPeriods(
        business.vatReportingType,
        lowerBound,
        today,
      )) {
        this.tally(
          await this.createPeriodicTaskOnly(delegation, business, TaskType.VAT_REPORT, period),
          result,
        );
      }
    }
    if (
      business.taxReportingType &&
      business.taxReportingType !== TaxReportingType.NOT_REQUIRED
    ) {
      for (const period of this.enumeratePeriodicPeriods(
        business.taxReportingType,
        lowerBound,
        today,
      )) {
        this.tally(
          await this.createPeriodicTaskOnly(delegation, business, TaskType.ADVANCE_TAX, period),
          result,
        );
      }
    }
    for (const annual of this.enumerateAnnualPeriods(lowerBound, today)) {
      this.tally(await this.createAnnualTask(delegation, business, annual), result);
    }
  }

  // ----- per-period creators (called once per enumerated period) -----

  /** Insert AccountantTask + workflow for a single period (delegation path). */
  private async createPeriodicPair(
    delegation: Delegation,
    business: Business,
    type: TaskType.VAT_REPORT | TaskType.ADVANCE_TAX,
    period: PeriodicPeriod,
  ): Promise<'created' | 'skipped'> {
    const taskOutcome = await this.insertTaskOrIgnore({
      accountantFirebaseId: delegation.agentId,
      clientFirebaseId: delegation.userId,
      businessNumber: business.businessNumber!,
      type,
      source: TaskSource.AUTO,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      title: this.titleFor(type, period.label),
      description: null,
      dueDate: period.dueDate,
      visibleFrom: period.visibleFrom,
      isComplete: false,
      completedAt: null,
      dismissedAt: null,
    });

    const workflowType =
      type === TaskType.VAT_REPORT
        ? ReportWorkflowType.VAT_REPORT
        : ReportWorkflowType.ADVANCE_TAX;
    const workflowResult = await this.upsertWorkflow({
      clientFirebaseId: delegation.userId,
      businessNumber: business.businessNumber!,
      type: workflowType,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });

    if (workflowResult.outcome === 'created' && workflowResult.workflow) {
      this.notifications
        .notifyClientWorkflowCreated({ workflow: workflowResult.workflow })
        .catch((e) => this.logger.warn(`notify failed: ${e?.message ?? e}`));
    }

    return taskOutcome;
  }

  /** Insert AccountantTask only (workflow already created in workflow phase). */
  private async createPeriodicTaskOnly(
    delegation: Delegation,
    business: Business,
    type: TaskType.VAT_REPORT | TaskType.ADVANCE_TAX,
    period: PeriodicPeriod,
  ): Promise<'created' | 'skipped'> {
    return this.insertTaskOrIgnore({
      accountantFirebaseId: delegation.agentId,
      clientFirebaseId: delegation.userId,
      businessNumber: business.businessNumber!,
      type,
      source: TaskSource.AUTO,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      title: this.titleFor(type, period.label),
      description: null,
      dueDate: period.dueDate,
      visibleFrom: period.visibleFrom,
      isComplete: false,
      completedAt: null,
      dismissedAt: null,
    });
  }

  /** Insert ANNUAL_REPORT task for a single tax year. */
  private async createAnnualTask(
    delegation: Delegation,
    business: Business,
    annual: AnnualPeriod,
  ): Promise<'created' | 'skipped'> {
    if (!business.businessNumber) return 'skipped';
    return this.insertTaskOrIgnore({
      accountantFirebaseId: delegation.agentId,
      clientFirebaseId: delegation.userId,
      businessNumber: business.businessNumber,
      type: TaskType.ANNUAL_REPORT,
      source: TaskSource.AUTO,
      periodStart: annual.periodStart,
      periodEnd: annual.periodEnd,
      title: `דוח שנתי – ${annual.taxYear}`,
      description: null,
      dueDate: annual.dueDate,
      visibleFrom: annual.visibleFrom,
      isComplete: false,
      completedAt: null,
      dismissedAt: null,
    });
  }

  // ----- enumerators -----

  /**
   * Lower bound for backfill: the more recent of (business creation date) and
   * (today - LOOKBACK months). If `business.createdAt` is null (legacy data),
   * defaults to today, so no historical backfill happens.
   */
  private computeLowerBound(business: Business, today: Date): Date {
    const cap = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - PERIODIC_LOOKBACK_MONTHS, 1),
    );
    const created = business.createdAt
      ? new Date(business.createdAt)
      : new Date(today);
    const createdUtc = new Date(
      Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()),
    );
    return createdUtc > cap ? createdUtc : cap;
  }

  /**
   * Yield every VAT/advance-tax period that:
   *  - has fully ended on or before `today`, AND
   *  - ended on or after `lowerBound` (so we don't generate periods before the
   *    business existed in the app).
   *
   * Walks forward from `lowerBound`'s month, stepping 1 month for monthly
   * reporting or 2 months for bi-monthly reporting.
   */
  private enumeratePeriodicPeriods(
    reportingType: VATReportingType | TaxReportingType,
    lowerBound: Date,
    today: Date,
  ): PeriodicPeriod[] {
    const isSingleMonth =
      reportingType === VATReportingType.MONTHLY_REPORT ||
      reportingType === TaxReportingType.MONTHLY_REPORT;
    const stepMonths = isSingleMonth ? 1 : 2;
    const periods: PeriodicPeriod[] = [];

    let cursorYear = lowerBound.getUTCFullYear();
    let cursorMonth = lowerBound.getUTCMonth(); // 0-indexed
    let safety = 0;
    const seen = new Set<string>();

    while (safety++ < 60) {
      // Local Date probe; getVATReportingDate uses local getMonth/getFullYear.
      const probeDate = new Date(cursorYear, cursorMonth, 15);
      const label = this.sharedService.getVATReportingDate(
        probeDate,
        reportingType as VATReportingType,
      );
      if (!label) break;

      let yearStr: string;
      let monthStr: string;
      if (isSingleMonth) {
        const [m, y] = (label as string).split('/');
        monthStr = m;
        yearStr = y;
      } else {
        const [pair, y] = (label as string).split('/');
        monthStr = pair.split('-')[0];
        yearStr = y;
      }

      const key = `${yearStr}|${monthStr}|${isSingleMonth}`;
      const { startDate, endDate } = this.sharedService.getStartAndEndDate(
        yearStr,
        monthStr,
        isSingleMonth,
      );
      // Stop once we reach a period that hasn't ended yet.
      if (!startDate || !endDate || endDate >= today) break;

      // Include only when the business existed by the time the period ended.
      if (endDate >= lowerBound && !seen.has(key)) {
        seen.add(key);
        const dueMonthIdx = endDate.getUTCMonth() + 1;
        const dueYear = endDate.getUTCFullYear() + Math.floor(dueMonthIdx / 12);
        const dueDate = new Date(Date.UTC(dueYear, dueMonthIdx % 12, 15));
        const visibleFrom = new Date(
          Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() + 1),
        );
        const periodStart = new Date(
          Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
        );
        const periodEnd = new Date(
          Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
        );
        periods.push({ periodStart, periodEnd, dueDate, visibleFrom, label: label as string });
      }

      cursorMonth += stepMonths;
      while (cursorMonth >= 12) {
        cursorMonth -= 12;
        cursorYear++;
      }
    }
    return periods;
  }

  /**
   * Yield every annual-report period (one per tax year) where the report's
   * `visibleFrom = Jan 1 of next year` is on or before today, and the year is
   * within ANNUAL_LOOKBACK_YEARS of today.
   */
  private enumerateAnnualPeriods(lowerBound: Date, today: Date): AnnualPeriod[] {
    const periods: AnnualPeriod[] = [];
    const lastFullYear = today.getUTCFullYear() - 1; // most-recently-ended tax year
    const cap = today.getUTCFullYear() - ANNUAL_LOOKBACK_YEARS;
    const lowerYear = Math.max(lowerBound.getUTCFullYear(), cap);
    for (let y = lowerYear; y <= lastFullYear; y++) {
      const periodStart = new Date(Date.UTC(y, 0, 1));
      const periodEnd = new Date(Date.UTC(y, 11, 31));
      const dueDate = new Date(Date.UTC(y + 1, 4, 31));
      const visibleFrom = new Date(Date.UTC(y + 1, 0, 1));
      if (visibleFrom > today) continue;
      periods.push({ taxYear: y, periodStart, periodEnd, dueDate, visibleFrom });
    }
    return periods;
  }

  private titleFor(
    type: TaskType.VAT_REPORT | TaskType.ADVANCE_TAX,
    label: string,
  ): string {
    return type === TaskType.VAT_REPORT
      ? `דוח מע"מ – ${label}`
      : `מקדמת מס – ${label}`;
  }

  private toUtcDate(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private groupBusinessesByUser(businesses: Business[]): Map<string, Business[]> {
    const byUser = new Map<string, Business[]>();
    for (const b of businesses) {
      if (!b.businessNumber) continue;
      const arr = byUser.get(b.firebaseId) ?? [];
      arr.push(b);
      byUser.set(b.firebaseId, arr);
    }
    return byUser;
  }

  private tally(outcome: 'created' | 'skipped', result: GenerationResult): void {
    if (outcome === 'created') result.created++;
    else result.skipped++;
  }

  // ----- idempotent inserts -----

  private async insertTaskOrIgnore(
    values: Partial<AccountantTask>,
  ): Promise<'created' | 'skipped'> {
    try {
      await this.tasksRepo.insert(values);
      return 'created';
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) return 'skipped';
      throw err;
    }
  }

  private async upsertWorkflow(values: {
    clientFirebaseId: string;
    businessNumber: string;
    type: ReportWorkflowType;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<{ outcome: 'created' | 'skipped'; workflow: ReportWorkflow | null }> {
    try {
      const result = await this.workflowRepo.insert({
        ...values,
        status: ReportWorkflowStatus.WAITING_FOR_CLIENT,
      });
      const id = result.identifiers?.[0]?.id as number | undefined;
      const workflow = id ? await this.workflowRepo.findOne({ where: { id } }) : null;
      return { outcome: 'created', workflow };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        return { outcome: 'skipped', workflow: null };
      }
      throw err;
    }
  }
}

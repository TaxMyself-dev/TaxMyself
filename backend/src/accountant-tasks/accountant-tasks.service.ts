import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountantTask, TaskSource, TaskType } from './accountant-task.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { User } from 'src/users/user.entity';
import { AnnualReport, AnnualReportStatus } from 'src/annual-report/annual-report.entity';
import {
  ReportWorkflow,
  ReportWorkflowStatus,
  ReportWorkflowType,
} from 'src/report-workflow/report-workflow.entity';
import { CreateTaskDto } from './dtos/create-task.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';
import { QueryTasksDto } from './dtos/query-tasks.dto';
import { TasksGeneratorService } from './tasks-generator.service';

export interface AccountantTaskRow extends AccountantTask {
  clientName: string;
  businessName: string;
  annualReportId?: number;
  annualReportStatus?: AnnualReportStatus;
  workflowId?: number;
  workflowStatus?: ReportWorkflowStatus;
}

@Injectable()
export class AccountantTasksService {
  constructor(
    @InjectRepository(AccountantTask)
    private readonly tasksRepo: Repository<AccountantTask>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AnnualReport)
    private readonly annualReportRepo: Repository<AnnualReport>,
    @InjectRepository(ReportWorkflow)
    private readonly workflowRepo: Repository<ReportWorkflow>,
    private readonly tasksGenerator: TasksGeneratorService,
  ) {}

  async list(accountantFirebaseId: string, query: QueryTasksDto): Promise<AccountantTaskRow[]> {
    // Refresh state on entry (replaces the daily cron). Errors must not block the list.
    try {
      await this.tasksGenerator.generateForAccountant(accountantFirebaseId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('generateForAccountant failed:', err?.message ?? err);
    }

    const status = query.status ?? 'open';
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const qb = this.tasksRepo
      .createQueryBuilder('t')
      .where('t.accountantFirebaseId = :acc', { acc: accountantFirebaseId })
      .andWhere('t.dismissedAt IS NULL')
      .andWhere('t.visibleFrom <= :today', { today });

    if (status === 'open') qb.andWhere('t.isComplete = :ic', { ic: false });
    else if (status === 'done') qb.andWhere('t.isComplete = :ic', { ic: true });

    if (query.clientId) qb.andWhere('t.clientFirebaseId = :cli', { cli: query.clientId });
    if (query.businessNumber) qb.andWhere('t.businessNumber = :bn', { bn: query.businessNumber });
    if (query.from) qb.andWhere('t.dueDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.dueDate <= :to', { to: query.to });

    qb.orderBy('t.isComplete', 'ASC').addOrderBy('t.dueDate', 'ASC');

    const tasks = await qb.getMany();
    return this.enrich(tasks);
  }

  async create(accountantFirebaseId: string, dto: CreateTaskDto): Promise<AccountantTaskRow> {
    await this.assertActiveDelegation(accountantFirebaseId, dto.clientFirebaseId);
    await this.assertBusinessOwnedByClient(dto.clientFirebaseId, dto.businessNumber);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : today;

    const task = this.tasksRepo.create({
      accountantFirebaseId,
      clientFirebaseId: dto.clientFirebaseId,
      businessNumber: dto.businessNumber,
      type: TaskType.CUSTOM,
      source: TaskSource.MANUAL,
      periodStart: null,
      periodEnd: null,
      title: dto.title,
      description: dto.description ?? null,
      dueDate,
      visibleFrom: today,
      isComplete: false,
      completedAt: null,
      dismissedAt: null,
    });

    const saved = await this.tasksRepo.save(task);
    const [enriched] = await this.enrich([saved]);
    return enriched;
  }

  async update(
    accountantFirebaseId: string,
    id: number,
    dto: UpdateTaskDto,
  ): Promise<AccountantTaskRow> {
    const task = await this.findOwned(accountantFirebaseId, id);

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.dueDate !== undefined) task.dueDate = new Date(dto.dueDate);
    if (dto.isComplete !== undefined && dto.isComplete !== task.isComplete) {
      task.isComplete = dto.isComplete;
      task.completedAt = dto.isComplete ? new Date() : null;
    }

    const saved = await this.tasksRepo.save(task);
    const [enriched] = await this.enrich([saved]);
    return enriched;
  }

  async remove(accountantFirebaseId: string, id: number): Promise<void> {
    const task = await this.findOwned(accountantFirebaseId, id);

    if (task.source === TaskSource.MANUAL) {
      await this.tasksRepo.delete({ id: task.id });
    } else {
      task.dismissedAt = new Date();
      await this.tasksRepo.save(task);
    }
  }

  private async findOwned(accountantFirebaseId: string, id: number): Promise<AccountantTask> {
    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('המשימה לא נמצאה');
    if (task.accountantFirebaseId !== accountantFirebaseId) {
      throw new ForbiddenException('אין הרשאה למשימה זו');
    }
    return task;
  }

  private async assertActiveDelegation(agentId: string, userId: string): Promise<void> {
    const delegation = await this.delegationRepo.findOne({
      where: { agentId, userId, status: DelegationStatus.ACTIVE },
    });
    if (!delegation) {
      throw new ForbiddenException('אין הרשאה ללקוח זה');
    }
  }

  private async assertBusinessOwnedByClient(
    clientFirebaseId: string,
    businessNumber: string,
  ): Promise<void> {
    const business = await this.businessRepo.findOne({
      where: { firebaseId: clientFirebaseId, businessNumber },
    });
    if (!business) {
      throw new NotFoundException('העסק לא נמצא ללקוח זה');
    }
  }

  private async enrich(tasks: AccountantTask[]): Promise<AccountantTaskRow[]> {
    if (tasks.length === 0) return [];

    const clientIds = Array.from(new Set(tasks.map((t) => t.clientFirebaseId)));
    const businessNumbers = Array.from(new Set(tasks.map((t) => t.businessNumber)));

    const annualTasks = tasks.filter(
      (t) => t.type === TaskType.ANNUAL_REPORT && t.periodStart != null,
    );
    const annualBusinessNumbers = Array.from(
      new Set(annualTasks.map((t) => t.businessNumber)),
    );

    const periodicTasks = tasks.filter(
      (t) =>
        (t.type === TaskType.VAT_REPORT || t.type === TaskType.ADVANCE_TAX) &&
        t.periodStart != null &&
        t.periodEnd != null,
    );
    const periodicBusinessNumbers = Array.from(
      new Set(periodicTasks.map((t) => t.businessNumber)),
    );

    const [users, businesses, annualReports, workflows] = await Promise.all([
      this.userRepo.find({
        where: { firebaseId: In(clientIds) },
        select: ['firebaseId', 'fName', 'lName'],
      }),
      this.businessRepo.find({
        where: { businessNumber: In(businessNumbers) },
        select: ['businessNumber', 'businessName', 'firebaseId'],
      }),
      annualBusinessNumbers.length > 0
        ? this.annualReportRepo.find({
            where: { businessNumber: In(annualBusinessNumbers) },
            select: ['id', 'businessNumber', 'taxYear', 'status'],
          })
        : Promise.resolve([]),
      periodicBusinessNumbers.length > 0
        ? this.workflowRepo.find({
            where: { businessNumber: In(periodicBusinessNumbers) },
            select: ['id', 'businessNumber', 'type', 'periodStart', 'periodEnd', 'status'],
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(
      users.map((u) => [u.firebaseId, `${u.fName ?? ''} ${u.lName ?? ''}`.trim()]),
    );
    const businessMap = new Map(
      businesses.map((b) => [`${b.firebaseId}|${b.businessNumber}`, b.businessName ?? '']),
    );
    const annualMap = new Map(
      annualReports.map((r) => [`${r.businessNumber}|${r.taxYear}`, r]),
    );
    const workflowMap = new Map(
      workflows.map((w) => [
        `${w.businessNumber}|${w.type}|${this.dateKey(w.periodStart)}|${this.dateKey(w.periodEnd)}`,
        w,
      ]),
    );

    return tasks.map((t) => {
      const row: AccountantTaskRow = {
        ...t,
        clientName: userMap.get(t.clientFirebaseId) ?? '',
        businessName: businessMap.get(`${t.clientFirebaseId}|${t.businessNumber}`) ?? '',
      };
      if (t.type === TaskType.ANNUAL_REPORT && t.periodStart) {
        const taxYear = new Date(t.periodStart).getUTCFullYear();
        const annual = annualMap.get(`${t.businessNumber}|${taxYear}`);
        if (annual) {
          row.annualReportId = annual.id;
          row.annualReportStatus = annual.status;
        }
      } else if (
        (t.type === TaskType.VAT_REPORT || t.type === TaskType.ADVANCE_TAX) &&
        t.periodStart &&
        t.periodEnd
      ) {
        const workflowType =
          t.type === TaskType.VAT_REPORT
            ? ReportWorkflowType.VAT_REPORT
            : ReportWorkflowType.ADVANCE_TAX;
        const workflow = workflowMap.get(
          `${t.businessNumber}|${workflowType}|${this.dateKey(t.periodStart)}|${this.dateKey(t.periodEnd)}`,
        );
        if (workflow) {
          row.workflowId = workflow.id;
          row.workflowStatus = workflow.status;
        }
      }
      return row;
    });
  }

  /** Normalize a date column value to YYYY-MM-DD for stable map keys. */
  private dateKey(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toISOString().slice(0, 10);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AnnualReport, AnnualReportStatus } from './annual-report.entity';
import { AnnualReportFile } from './annual-report-file.entity';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import {
  AccountantTask,
  TaskType,
} from 'src/accountant-tasks/accountant-task.entity';
import {
  ANNUAL_REPORT_QUESTIONS,
  computeRequiredCategories,
} from './annual-report.questions';
import { UploadFileDto } from './dtos/upload-file.dto';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { BusinessType, isExemptBusinessType, ReportPeriodLabel } from 'src/enum';

/** API response shape: report + its files (files are loaded separately, no ORM relation). */
export interface AnnualReportWithFiles extends AnnualReport {
  files: AnnualReportFile[];
}

@Injectable()
export class AnnualReportService {
  private readonly logger = new Logger(AnnualReportService.name);

  constructor(
    @InjectRepository(AnnualReport)
    private readonly reportRepo: Repository<AnnualReport>,
    @InjectRepository(AnnualReportFile)
    private readonly fileRepo: Repository<AnnualReportFile>,
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
  ) {}

  /** Returns the question schema (no labels — frontend owns Hebrew labels). */
  getQuestionSchema() {
    return ANNUAL_REPORT_QUESTIONS;
  }

  async getOrCreate(
    requesterFirebaseId: string,
    businessNumber: string,
    taxYear: number,
  ): Promise<AnnualReportWithFiles> {
    const business = await this.businessRepo.findOne({ where: { businessNumber } });
    if (!business) throw new NotFoundException('עסק לא נמצא');

    await this.assertAccess(requesterFirebaseId, business.firebaseId);

    const existing = await this.reportRepo.findOne({
      where: { businessNumber, taxYear },
    });
    if (existing) return this.attachFiles(existing);

    const created = this.reportRepo.create({
      clientFirebaseId: business.firebaseId,
      businessNumber,
      taxYear,
      status: AnnualReportStatus.WAITING_FOR_DOCS,
      answers: null,
      requiredCategories: [],
    });
    const saved = await this.reportRepo.save(created);
    return { ...saved, files: [] };
  }

  async saveAnswers(
    requesterFirebaseId: string,
    reportId: number,
    answers: Record<string, unknown>,
  ): Promise<AnnualReportWithFiles> {
    const report = await this.findWithAccess(requesterFirebaseId, reportId);
    if (report.status === AnnualReportStatus.REPORTED) {
      throw new BadRequestException('הדוח כבר דווח, לא ניתן לשנות תשובות');
    }

    report.answers = answers ?? {};
    report.requiredCategories = computeRequiredCategories(report.answers);
    const saved = await this.reportRepo.save(report);
    return this.attachFiles(saved);
  }

  async addFile(
    requesterFirebaseId: string,
    reportId: number,
    dto: UploadFileDto,
  ): Promise<AnnualReportFile> {
    const report = await this.findWithAccess(requesterFirebaseId, reportId);
    if (report.status === AnnualReportStatus.REPORTED) {
      throw new BadRequestException('הדוח כבר דווח, לא ניתן להוסיף קבצים');
    }

    const file = this.fileRepo.create({
      annualReportId: report.id,
      category: dto.category,
      filePath: dto.filePath,
      fileName: dto.fileName,
      uploadedByFirebaseId: requesterFirebaseId,
    });
    return this.fileRepo.save(file);
  }

  async removeFile(requesterFirebaseId: string, fileId: number): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('הקובץ לא נמצא');

    const report = await this.reportRepo.findOne({ where: { id: file.annualReportId } });
    if (!report) throw new NotFoundException('הדוח לא נמצא');

    await this.assertAccess(requesterFirebaseId, report.clientFirebaseId);
    if (report.status === AnnualReportStatus.REPORTED) {
      throw new BadRequestException('הדוח כבר דווח, לא ניתן להסיר קבצים');
    }

    await this.fileRepo.delete({ id: file.id });
  }

  async finish(
    requesterFirebaseId: string,
    reportId: number,
  ): Promise<AnnualReportWithFiles> {
    const report = await this.findWithAccess(requesterFirebaseId, reportId);
    if (report.status === AnnualReportStatus.REPORTED) {
      throw new BadRequestException('הדוח כבר דווח');
    }

    const files = await this.fileRepo.find({ where: { annualReportId: report.id } });
    const required = report.requiredCategories ?? [];
    const uploadedByCategory = new Map<string, number>();
    for (const f of files) {
      uploadedByCategory.set(f.category, (uploadedByCategory.get(f.category) ?? 0) + 1);
    }
    const missing = required.filter(
      (req) => (uploadedByCategory.get(req.category) ?? 0) < req.minCount,
    );
    if (missing.length > 0) {
      const detail = missing
        .map((m) => `${m.category}: ${uploadedByCategory.get(m.category) ?? 0}/${m.minCount}`)
        .join(', ');
      throw new BadRequestException(`חסרים מסמכים: ${detail}`);
    }

    report.status = AnnualReportStatus.READY_TO_PREPARE;
    report.finishedAt = new Date();
    const saved = await this.reportRepo.save(report);
    return { ...saved, files };
  }

  async setReported(
    accountantFirebaseId: string,
    reportId: number,
    reported: boolean,
  ): Promise<AnnualReportWithFiles> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('הדוח לא נמצא');

    // Accountant-only — must have an active delegation to this client.
    const delegation = await this.delegationRepo.findOne({
      where: {
        agentId: accountantFirebaseId,
        userId: report.clientFirebaseId,
        status: DelegationStatus.ACTIVE,
      },
    });
    if (!delegation) throw new ForbiddenException('גישה מותרת רק לרואה חשבון של הלקוח');

    if (reported) {
      if (report.status !== AnnualReportStatus.READY_TO_PREPARE && report.status !== AnnualReportStatus.REPORTED) {
        throw new BadRequestException('ניתן לסמן כדווח רק כאשר הדוח מוכן להכנה');
      }
      report.status = AnnualReportStatus.REPORTED;
      report.reportedAt = new Date();
      report.reportedByAccountantFirebaseId = accountantFirebaseId;
    } else {
      if (report.status !== AnnualReportStatus.REPORTED) {
        throw new BadRequestException('הדוח אינו במצב מדווח');
      }
      report.status = AnnualReportStatus.READY_TO_PREPARE;
      report.reportedAt = null;
      report.reportedByAccountantFirebaseId = null;
    }
    const saved = await this.reportRepo.save(report);

    // Sync the matching ANNUAL_REPORT AccountantTask(s) for this business/year.
    await this.syncAccountantTasks(report.businessNumber, report.taxYear, reported);

    if (reported) {
      await this.lockAnnualTransactions(saved);
    } else {
      await this.unlockAnnualTransactions(saved);
    }

    return this.attachFiles(saved);
  }

  // ---------- helpers ----------

  private async findWithAccess(
    requesterFirebaseId: string,
    reportId: number,
  ): Promise<AnnualReport> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('הדוח לא נמצא');
    await this.assertAccess(requesterFirebaseId, report.clientFirebaseId);
    return report;
  }

  private async attachFiles(report: AnnualReport): Promise<AnnualReportWithFiles> {
    const files = await this.fileRepo.find({
      where: { annualReportId: report.id },
      order: { uploadedAt: 'ASC' },
    });
    return { ...report, files };
  }

  private async assertAccess(
    requesterFirebaseId: string,
    clientFirebaseId: string,
  ): Promise<void> {
    if (requesterFirebaseId === clientFirebaseId) return;
    const delegation = await this.delegationRepo.findOne({
      where: {
        agentId: requesterFirebaseId,
        userId: clientFirebaseId,
        status: DelegationStatus.ACTIVE,
      },
    });
    if (!delegation) throw new ForbiddenException('אין גישה לדוח זה');
  }

  private async syncAccountantTasks(
    businessNumber: string,
    taxYear: number,
    reported: boolean,
  ): Promise<void> {
    const periodStart = new Date(Date.UTC(taxYear, 0, 1));
    const tasks = await this.taskRepo.find({
      where: {
        businessNumber,
        type: TaskType.ANNUAL_REPORT,
        periodStart,
      },
    });
    for (const t of tasks) {
      const next = reported;
      if (t.isComplete === next) continue;
      t.isComplete = next;
      t.completedAt = next ? new Date() : null;
      await this.taskRepo.save(t);
    }
  }

  /**
   * On annual report approval, stamp slim_transactions.vatReportingDate with
   * the tax year (e.g. "2024") for every income-tax-only transaction in this
   * business and tax year — i.e. anything that was NOT already locked by a
   * VAT report. The same field doubles as the classification lock.
   *
   * Eligibility per row:
   *   business is EXEMPT  → all transactions get locked here.
   *   business is LICENSED/LIMITED_COMPANY/AUTHORIZED_PARTNERSHIP → only rows with vatPercent = 0 get locked
   *     here (rows with vatPercent > 0 should have been locked by the VAT
   *     report already; if a VAT report was never approved, those rows stay
   *     editable until that happens).
   */
  private async lockAnnualTransactions(report: AnnualReport): Promise<void> {
    const business = await this.businessRepo.findOne({
      where: { businessNumber: report.businessNumber },
    });
    if (!business) return;

    const periodLabel: ReportPeriodLabel = String(report.taxYear);
    const yearStart = new Date(Date.UTC(report.taxYear, 0, 1));
    const yearEnd = new Date(Date.UTC(report.taxYear, 11, 31, 23, 59, 59));

    const ids = await this.findLockableExternalIds(
      report,
      business.businessType ?? BusinessType.EXEMPT,
      yearStart,
      yearEnd,
    );
    if (ids.length === 0) {
      this.logger.log(
        `lockAnnualTransactions: no eligible transactions for report ${report.id} (year ${periodLabel}).`,
      );
      return;
    }
    const filter = {
      userId: report.clientFirebaseId,
      externalTransactionId: In(ids),
      isLocked: false,
    } as const;
    const patch = { vatReportingDate: periodLabel, isLocked: true } as const;
    await this.slimRepo.update(filter, patch);
    await this.cacheRepo.update(filter, patch);
    this.logger.log(
      `lockAnnualTransactions: locked ${ids.length} transactions to year ${periodLabel} (report ${report.id}).`,
    );
  }

  private async unlockAnnualTransactions(report: AnnualReport): Promise<void> {
    const periodLabel: ReportPeriodLabel = String(report.taxYear);
    const filter = {
      userId: report.clientFirebaseId,
      businessNumber: report.businessNumber,
      vatReportingDate: periodLabel,
    } as const;
    await this.slimRepo.update(filter, { isLocked: false });
    await this.cacheRepo.update(filter, { isLocked: false });
    this.logger.log(
      `unlockAnnualTransactions: cleared lock for year ${periodLabel} (report ${report.id}).`,
    );
  }

  private async findLockableExternalIds(
    report: AnnualReport,
    businessType: BusinessType,
    yearStart: Date,
    yearEnd: Date,
  ): Promise<string[]> {
    const qb = this.slimRepo
      .createQueryBuilder('slim')
      .innerJoin(
        FullTransactionCache,
        'cache',
        'cache.userId = slim.userId AND cache.externalTransactionId = slim.externalTransactionId',
      )
      .select('slim.externalTransactionId', 'externalTransactionId')
      .where('slim.userId = :userId', { userId: report.clientFirebaseId })
      .andWhere('slim.businessNumber = :businessNumber', {
        businessNumber: report.businessNumber,
      })
      .andWhere('slim.isLocked = FALSE')
      .andWhere('cache.transactionDate BETWEEN :start AND :end', {
        start: yearStart,
        end: yearEnd,
      });

    // For VAT-filing businesses, the annual report only locks the income-tax-only
    // rows; VAT-eligible rows are locked by the VAT report instead.
    if (!isExemptBusinessType(businessType)) {
      qb.andWhere('slim.vatPercent = 0');
    }

    const rows = await qb.getRawMany<{ externalTransactionId: string }>();
    return rows.map((r) => r.externalTransactionId);
  }
}

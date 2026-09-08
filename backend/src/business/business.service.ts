import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from './business.entity';
import { EntityManager, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { BusinessType, ExpenseApprovalStatus, isBusinessTypeAllowedForUser, isExemptBusinessType, VATReportingType } from 'src/enum';
import { SharedService } from 'src/shared/shared.service';
import { Expense } from 'src/expenses/expenses.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';


@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly sharedService: SharedService,
  ) { }


  // Fetch all businesses that belong to a specific user (by firebaseId)
  async getUserBusinesses(firebaseId: string): Promise<Business[]> {
    
    if (!firebaseId) {
      throw new Error('Firebase ID is missing in request');
    }

    // Fetch all businesses for this user
    const businesses = await this.businessRepo.find({
      where: { firebaseId },
      order: { id: 'ASC' },
    });
    
    return businesses;
  }


  async getBusinessByNumber(businessNumber: string, firebaseId?: string): Promise<Business | null> {
    const where: any = { businessNumber };
    if (firebaseId) {
      where.firebaseId = firebaseId;
    }
    
    return await this.businessRepo.findOne({ where });
  }

  async updateBusiness(
    firebaseId: string,
    dto: { id?: number; businessNumber?: string; advanceTaxPercent?: number; businessName?: string; businessAddress?: string; businessPhone?: string; businessEmail?: string; businessType?: string; businessField?: string; vatReportingType?: string; taxReportingType?: string; nationalInsRequired?: boolean },
  ): Promise<Business> {
    let business: Business | null;
    if (dto.id != null) {
      business = await this.businessRepo.findOne({ where: { id: dto.id, firebaseId } });
    } else if (dto.businessNumber != null && dto.businessNumber !== '') {
      business = await this.businessRepo.findOne({ where: { businessNumber: dto.businessNumber, firebaseId } });
    } else {
      throw new NotFoundException('Business id or businessNumber is required');
    }
    if (!business) {
      throw new NotFoundException('Business not found or not owned by user');
    }
    if (dto.businessType !== undefined) {
      await this.assertBusinessTypeAllowed(firebaseId, dto.businessType as BusinessType | null);
    }
    const previousBusinessType = business.businessType as BusinessType | null;
    const previousVatReportingType = business.vatReportingType;
    const nextBusinessType = (dto.businessType ?? business.businessType) as BusinessType | null;
    const requestedVatReportingType = (dto as any).vatReportingType as VATReportingType | undefined;
    const nextVatReportingType = this.resolveVatReportingType(
      nextBusinessType,
      requestedVatReportingType ?? business.vatReportingType,
    );
    if (dto.advanceTaxPercent !== undefined) business.advanceTaxPercent = dto.advanceTaxPercent;
    if (dto.businessName !== undefined) business.businessName = dto.businessName;
    if (dto.businessAddress !== undefined) business.businessAddress = dto.businessAddress;
    if (dto.businessPhone !== undefined) business.businessPhone = dto.businessPhone;
    if (dto.businessEmail !== undefined) business.businessEmail = dto.businessEmail;
    if (dto.businessType !== undefined) business.businessType = dto.businessType as any;
    if (dto.businessField !== undefined) business.businessField = dto.businessField as any;
    if (dto.businessType !== undefined || requestedVatReportingType !== undefined) {
      business.vatReportingType = nextVatReportingType;
    }
    if ((dto as any).taxReportingType !== undefined) business.taxReportingType = (dto as any).taxReportingType;
    if ((dto as any).nationalInsRequired !== undefined) business.nationalInsRequired = (dto as any).nationalInsRequired;
    const mustRebucketOpenPeriods =
      !isExemptBusinessType(nextBusinessType) &&
      nextBusinessType != null &&
      (previousBusinessType !== nextBusinessType || previousVatReportingType !== nextVatReportingType);

    if (!mustRebucketOpenPeriods) return this.businessRepo.save(business);

    return this.businessRepo.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(Business).save(business);
      if (saved.businessNumber) {
        await this.rebucketOpenVatPeriods(
          manager,
          firebaseId,
          saved.businessNumber,
          nextBusinessType,
          nextVatReportingType,
        );
      }
      return saved;
    });
  }

  /**
   * Re-labels only unreported/unlocked records when VAT cadence changes.
   * Expense and journal headers are changed in the same DB transaction so a
   * report can never observe the half-updated state that caused the incident.
   */
  private async rebucketOpenVatPeriods(
    manager: EntityManager,
    firebaseId: string,
    businessNumber: string,
    businessType: BusinessType,
    vatReportingType: VATReportingType,
  ): Promise<void> {
    const expenseRepo = manager.getRepository(Expense);
    const openExpenses = await expenseRepo.createQueryBuilder('expense')
      .where('CAST(expense.userId AS BINARY) = CAST(:firebaseId AS BINARY)', { firebaseId })
      .andWhere('CAST(expense.businessNumber AS BINARY) = CAST(:businessNumber AS BINARY)', { businessNumber })
      .andWhere('expense.approvalStatus = :approvalStatus', { approvalStatus: ExpenseApprovalStatus.APPROVED })
      .andWhere('COALESCE(expense.isReported, 0) = 0')
      .getMany();

    for (const expense of openExpenses) {
      const period = this.sharedService.buildReportPeriodLabel(
        businessType,
        vatReportingType,
        this.vatPeriodAnchor(expense.vatReportingDate, new Date(expense.date)),
      );
      expense.vatReportingDate = period as any;
      if (expense.journalEntryNumber != null) {
        await manager.getRepository(JournalEntry).createQueryBuilder()
          .update(JournalEntry)
          .set({ vatReportingPeriod: period })
          .where('entryNumber = :entryNumber', { entryNumber: expense.journalEntryNumber })
          .andWhere('CAST(issuerBusinessNumber AS BINARY) = CAST(:businessNumber AS BINARY)', { businessNumber })
          .andWhere('CAST(firebaseId AS BINARY) = CAST(:firebaseId AS BINARY)', { firebaseId })
          .execute();
      }
    }
    if (openExpenses.length > 0) await expenseRepo.save(openExpenses);

    const cacheRepo = manager.getRepository(FullTransactionCache);
    const openTransactions = await cacheRepo.createQueryBuilder('cache')
      .where('CAST(cache.userId AS BINARY) = CAST(:firebaseId AS BINARY)', { firebaseId })
      .andWhere('CAST(cache.businessNumber AS BINARY) = CAST(:businessNumber AS BINARY)', { businessNumber })
      .andWhere('cache.isLocked = false')
      .getMany();
    for (const transaction of openTransactions) {
      const period = this.sharedService.buildReportPeriodLabel(
        businessType,
        vatReportingType,
        this.vatPeriodAnchor(transaction.vatReportingDate, new Date(transaction.transactionDate)),
      );
      transaction.vatReportingDate = period;
      await manager.getRepository(SlimTransaction).createQueryBuilder()
        .update(SlimTransaction)
        .set({ vatReportingDate: period })
        .where('CAST(userId AS BINARY) = CAST(:firebaseId AS BINARY)', { firebaseId })
        .andWhere('externalTransactionId = :externalTransactionId', {
          externalTransactionId: transaction.externalTransactionId,
        })
        .andWhere('isLocked = false')
        .execute();
    }
    if (openTransactions.length > 0) await cacheRepo.save(openTransactions);
  }

  /**
   * Preserve a deliberate late-claim month while translating cadence. For a
   * bimonthly label we anchor on its ending month; converting it to monthly
   * therefore never moves the VAT claim earlier than the old filing period.
   */
  private vatPeriodAnchor(period: string | null | undefined, fallback: Date): Date {
    const monthly = period?.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthly) return new Date(Date.UTC(Number(monthly[2]), Number(monthly[1]) - 1, 1));
    const bimonthly = period?.match(/^\d{1,2}-(\d{1,2})\/(\d{4})$/);
    if (bimonthly) return new Date(Date.UTC(Number(bimonthly[2]), Number(bimonthly[1]) - 1, 1));
    return fallback;
  }

  async createBusiness(
    firebaseId: string,
    dto?: {
      businessName?: string;
      businessNumber?: string;
      businessAddress?: string;
      businessPhone?: string;
      businessEmail?: string;
      businessType?: string;
      businessField?: string;
      advanceTaxPercent?: number;
      vatReportingType?: string;
    },
  ): Promise<Business> {
    if (dto?.businessType !== undefined) {
      await this.assertBusinessTypeAllowed(firebaseId, dto.businessType as BusinessType | null);
    }
    const vatReportingType = this.resolveVatReportingType(
      dto?.businessType as BusinessType | null | undefined,
      dto?.vatReportingType as VATReportingType | null | undefined,
    );
    if (dto?.businessNumber) {
      const existing = await this.getBusinessByNumber(dto.businessNumber);
      if (existing && existing.firebaseId !== firebaseId) {
        throw new BadRequestException('מספר עסק זה כבר רשום במערכת תחת משתמש אחר');
      }
    }
    const business = this.businessRepo.create({
      firebaseId,
      businessName: dto?.businessName ?? null,
      businessNumber: dto?.businessNumber ?? null,
      businessAddress: dto?.businessAddress ?? null,
      businessPhone: dto?.businessPhone ?? null,
      businessEmail: dto?.businessEmail ?? null,
      businessType: (dto?.businessType as any) ?? null,
      businessField: (dto?.businessField as any) ?? null,
      advanceTaxPercent: dto?.advanceTaxPercent ?? null,
      vatReportingType,
    });
    const saved = await this.businessRepo.save(business);

    // Fire-and-forget Drive folder provisioning for the new business so the
    // request returns immediately. provisionDriveStructure iterates all the
    // user's businesses and skips any that already have a driveFolderId, so
    // calling it again only creates the new folder.
    void this.provisionDriveForNewBusiness(firebaseId);

    return saved;
  }

  private resolveVatReportingType(
    businessType: BusinessType | null | undefined,
    vatReportingType: VATReportingType | null | undefined,
  ): VATReportingType {
    if (isExemptBusinessType(businessType)) return VATReportingType.NOT_REQUIRED;
    if (businessType == null) return VATReportingType.NOT_REQUIRED;
    if (
      vatReportingType !== VATReportingType.MONTHLY_REPORT &&
      vatReportingType !== VATReportingType.DUAL_MONTH_REPORT
    ) {
      throw new BadRequestException('עסק החייב במע״מ חייב להיות מוגדר כדיווח חודשי או דו־חודשי');
    }
    return vatReportingType;
  }

  private async provisionDriveForNewBusiness(firebaseId: string): Promise<void> {
    try {
      const user = await this.usersService.findByFirebaseId(firebaseId);
      if (!user) return;
      // Include delegated accountants so the new business folder shows up in
      // their "Shared with me" automatically.
      const accountantEmails = await this.usersService.getActiveAccountantEmailsForUser(firebaseId);
      await this.usersService.provisionDriveStructure(user, accountantEmails);
    } catch (err: any) {
      this.logger.error(
        `provisionDriveForNewBusiness failed for firebaseId=${firebaseId}: ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }

  private async assertBusinessTypeAllowed(firebaseId: string, businessType: BusinessType | null): Promise<void> {
    const user = await this.usersService.findByFirebaseId(firebaseId);
    if (!isBusinessTypeAllowedForUser(!!user?.isCompany, businessType)) {
      throw new BadRequestException(`סוג עסק לא תואם לסוג ההרשמה: ${businessType}`);
    }
  }

  async deleteBusiness(firebaseId: string, id: number): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id, firebaseId } });
    if (!business) {
      throw new NotFoundException('Business not found or not owned by user');
    }
    await this.businessRepo.remove(business);
  }

}

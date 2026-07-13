import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseArrayPipe, ParseIntPipe, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards, } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';
import { CatalogService, CatalogScope } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { CreateAccountDto, AccountAvailability } from './dto/create-account.dto';
import { RepointSubCategoryAccountDto } from './dto/repoint-sub-category-account.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { OwnerType, RecognitionType, VisibilityScope } from 'src/enum';



@Controller('bookkeeping')
export class BookkepingController {
  constructor(
    private readonly bookkeepingService: BookkeepingService,
    private readonly catalogService: CatalogService,
    private readonly catalogContextService: CatalogContextService,
  ) { }

  /**
   * Phase 4.2 (D9/D10): repoint a sub_category at a different card so FUTURE
   * classifications resolve there — history never moves. SYSTEM rows get a
   * same-named CLIENT-scoped override (D4 precedence wins by name); the
   * acting business's scope is the target (accountant "all-my-clients"
   * scoping is Phase 5.1/5.2).
   */
  @Patch('sub-categories/:id/account')
  @UseGuards(FirebaseAuthGuard)
  async repointSubCategoryAccount(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RepointSubCategoryAccountDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    const businessNumber = request.user?.businessNumber;
    if (!businessNumber) throw new BadRequestException('businessNumber header is required');
    // 5.1: delegation-aware ctx — the accountant's own cards are valid
    // repoint targets, and accountant-layer sub_categories are reachable
    // (repointing one from a client context lands a CLIENT override row,
    // never edits the shared ACCOUNTANT row).
    const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
    return this.catalogService.repointSubCategoryAccount(id, body.accountId, ctx);
  }

  /**
   * Phase 5.2 (D11): accountant "add account" — a booking_account carrying
   * the full accounting law + (unless technicalOnly) a paired same-named
   * sub_category, created atomically. Actor-gated to ACCOUNTANT/ADMIN roles;
   * "current client only" additionally rides the delegation guard (the
   * impersonation write already required DOCUMENTS_WRITE, D12.2).
   */
  @Post('accounts')
  @UseGuards(FirebaseAuthGuard)
  async createAccount(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול להוסיף כרטיסי חשבון');
    }

    let scope: CatalogScope;
    if (dto.availableFor === AccountAvailability.CURRENT_CLIENT) {
      // CLIENT-owned rows for the impersonated business; accountantId records
      // the creator (D4: "creator when accountant created for a client").
      const businessNumber = request.user?.businessNumber;
      if (!businessNumber) {
        throw new BadRequestException('businessNumber header is required when availableFor=CURRENT_CLIENT');
      }
      scope = this.catalogService.buildScope(OwnerType.CLIENT, {
        userId: request.user?.firebaseId,
        businessNumber,
      });
      scope.accountantId = actorFirebaseId;
      scope.visibilityScope = VisibilityScope.SPECIFIC_CLIENT;
    } else {
      scope = this.catalogService.buildScope(OwnerType.ACCOUNTANT, { accountantId: actorFirebaseId });
    }

    const { account, subCategory } = await this.catalogService.createAccountWithSubCategory({
      scope,
      name: dto.name,
      code: dto.code ?? null,
      type: dto.type ?? 'expense',
      sectionId: dto.sectionId,
      code6111: dto.code6111 ?? null,
      law: {
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent ?? 0,
        isEquipment: dto.isEquipment ?? false,
        recognitionType: dto.recognitionType ?? RecognitionType.RECOGNIZED,
      },
      technicalOnly: dto.technicalOnly ?? false,
      categoryName: dto.categoryName ?? null,
      createdByUserId: actorFirebaseId,
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        sectionId: account.sectionId,
        code6111: account.code6111,
        vatPercent: account.vatPercent,
        taxPercent: account.taxPercent,
        reductionPercent: account.reductionPercent,
        isEquipment: account.isEquipment,
        recognitionType: account.recognitionType,
        ownerType: account.ownerType,
        chartOwnerKey: account.chartOwnerKey,
      },
      subCategory: subCategory
        ? {
            id: subCategory.id,
            name: subCategory.name,
            categoryId: subCategory.categoryId,
            ownerType: subCategory.ownerType,
            chartOwnerKey: subCategory.chartOwnerKey,
            approvalStatus: subCategory.approvalStatus,
          }
        : null,
    };
  }

  /**
   * Phase 5.4: the accountant catalog-management listing — every active
   * category/sub_category row across the three visible layers
   * (CLIENT/ACCOUNTANT/SYSTEM), each with its owner badge fields and an
   * isEffective flag (whether it wins the D4 merge for its name). Available
   * to anyone the guard lets act on the business — capabilities, not
   * visibility, are what's accountant-gated (D9).
   */
  @Get('catalog-overview')
  @UseGuards(FirebaseAuthGuard)
  async getCatalogOverview(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    const effectiveBusinessNumber = businessNumber?.trim() || request.user?.businessNumber;
    if (!effectiveBusinessNumber) throw new BadRequestException('businessNumber is required');
    return this.catalogService.getCatalogOverview(
      await this.catalogContextService.forUser(firebaseId, effectiveBusinessNumber),
    );
  }

  /**
   * Phase 5.4: the acting accountant's pending-approval queue —
   * sub_categories with MISSING_ACCOUNTING_MAPPING / PENDING_ACCOUNTANT_APPROVAL
   * across ALL their ACTIVE-delegation clients, with the number of expenses
   * blocked on each. Keyed to the ACTOR (works while impersonating a client).
   */
  @Get('pending-approvals')
  @UseGuards(FirebaseAuthGuard)
  async getPendingApprovals(@Req() request: AuthenticatedRequest) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול לצפות בתור האישורים');
    }
    const clientUserIds = await this.catalogContextService.activeClientIdsForAgent(actorFirebaseId);
    return this.catalogService.getPendingApprovals(clientUserIds);
  }

  /** Manual, single-sided journal entry (no counter-account) — for cases the
   *  automatic EXPENSE/document postings don't cover. */
  @Post('manual-journal-entry')
  @UseGuards(FirebaseAuthGuard)
  async createManualJournalEntry(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateManualJournalEntryDto,
  ): Promise<{ entryNumber: number; id: number }> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    const businessNumber = body.businessNumber?.trim() || request.user?.businessNumber;
    if (!businessNumber) throw new BadRequestException('businessNumber is required');
    return this.bookkeepingService.createManualJournalEntry(body, firebaseId, businessNumber);
  }

  /** Atomic batch version — the frontend's list-of-entries modal uses this one.
   *  Kept alongside the singular endpoint above for backward compatibility. */
  @Post('manual-journal-entries')
  @UseGuards(FirebaseAuthGuard)
  async createManualJournalEntries(
    @Req() request: AuthenticatedRequest,
    @Body(new ParseArrayPipe({ items: CreateManualJournalEntryDto })) body: CreateManualJournalEntryDto[],
  ): Promise<{ entryNumber: number; id: number }[]> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    if (!body?.length) throw new BadRequestException('At least one entry is required');
    const businessNumber = body[0]?.businessNumber?.trim() || request.user?.businessNumber;
    if (!businessNumber) throw new BadRequestException('businessNumber is required');
    return this.bookkeepingService.createManualJournalEntries(body, firebaseId, businessNumber);
  }

  /** Merged (CLIENT > ACCOUNTANT > SYSTEM) expense sub-categories for the
   *  manual-entry modal's optional sub_category picker (Phase 4.5). Private
   *  rows are excluded — they are never journaled (D5), so offering them on
   *  a journal-entry form would be a contradiction. */
  @Get('expense-catalog')
  @UseGuards(FirebaseAuthGuard)
  async getExpenseCatalog(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ): Promise<{ subCategoryId: number; category: string | null; subCategory: string }[]> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    if (!businessNumber?.trim()) throw new BadRequestException('businessNumber is required');
    const rows = await this.catalogService.getMergedExpenseCatalog(
      await this.catalogContextService.forUser(firebaseId, businessNumber.trim()),
    );
    return rows
      .filter((s) => !s.isPrivate)
      .map((s) => ({
        subCategoryId: s.id,
        category: s.category?.name ?? null,
        subCategory: s.name,
      }));
  }

  /** Valid vatReportingPeriod options for the manual-entry dropdown. */
  @Get('vat-reporting-periods')
  @UseGuards(FirebaseAuthGuard)
  async getVatReportingPeriods(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ): Promise<string[]> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    if (!businessNumber?.trim()) throw new BadRequestException('businessNumber is required');
    return this.bookkeepingService.getVatReportingPeriods(businessNumber.trim(), firebaseId);
  }

}
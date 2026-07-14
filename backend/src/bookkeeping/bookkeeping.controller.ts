import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseArrayPipe, ParseIntPipe, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards, } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';
import { CatalogService, CatalogScope } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { CreateAccountDto, AccountAvailability } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
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
      const businessNumber = dto.businessNumber?.trim() || request.user?.businessNumber;
      if (!businessNumber) {
        throw new BadRequestException('businessNumber is required when availableFor=CURRENT_CLIENT');
      }
      // Phase 6 hardening: the target business must belong to the effective
      // (impersonated) client — dto.businessNumber is caller-supplied.
      await this.catalogContextService.assertBusinessAccess(request.user?.firebaseId, businessNumber);
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
   * "כרטיסים" admin screen (Session 13): every card across all owner scopes
   * (optionally filtered by ownerType), with a resolved owner display name.
   * Admin-only — unlike POST accounts/GET sections (accountant-or-admin),
   * this exposes every business's private CLIENT cards in one flat list, so
   * it's gated tighter.
   */
  @Get('accounts')
  @UseGuards(FirebaseAuthGuard)
  async listAccounts(
    @Req() request: AuthenticatedRequest,
    @Query('ownerType') ownerType?: OwnerType,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול לצפות במסך ניהול הכרטיסים');
    }
    return this.catalogService.listAccountsForAdmin(ownerType);
  }

  /**
   * "כרטיסים" admin screen: the impact-count confirmation shown before
   * editing a shared card — "N sub_categories across M businesses point at
   * this". See CatalogService.getAccountUsage for what this count does and
   * doesn't capture.
   */
  @Get('accounts/:id/usage')
  @UseGuards(FirebaseAuthGuard)
  async getAccountUsage(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול לצפות במסך ניהול הכרטיסים');
    }
    return this.catalogService.getAccountUsage(id);
  }

  /**
   * "כרטיסים" admin screen: direct in-place edit of an existing card's own
   * fields. Unlike every sub_category-triggered write in this module (D10 —
   * never edits a card's percents in place), this IS the deliberate direct
   * mutation path, admin-only.
   */
  @Patch('accounts/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateAccount(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול לערוך כרטיס ישירות');
    }
    return this.catalogService.updateAccountFields(id, dto);
  }

  /**
   * Phase 6.2 (D11): sections for the add-account form's picker — SYSTEM +
   * the acting accountant's own chart. Actor-gated like POST accounts (the
   * only consumer is that form).
   */
  @Get('sections')
  @UseGuards(FirebaseAuthGuard)
  async getSections(@Req() request: AuthenticatedRequest) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול לצפות ברשימת החתכים');
    }
    const rows = await this.catalogService.getSections(['SYSTEM', `ACCOUNTANT_${actorFirebaseId}`]);
    return rows.map((s) => ({ id: s.id, code: s.code, name: s.name }));
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

  /**
   * Merged (CLIENT > ACCOUNTANT > SYSTEM) expense sub-categories.
   *
   * Consumers:
   *   - Manual-entry modal's sub_category picker (Phase 4.5) — default call;
   *     private rows are excluded (they are never journaled, D5).
   *   - AddCategoryComponent's D9 simple picker (Phase 6.2) — reads
   *     `accountId` to map behind the scenes.
   *   - The D9 approval screen (Phase 6.1) — `includePrivate=true`; the
   *     card-law/section fields feed the professional view's card picker
   *     (accounts grouped by section) and the client-side live-resolution
   *     preview on re-classification.
   */
  @Get('expense-catalog')
  @UseGuards(FirebaseAuthGuard)
  async getExpenseCatalog(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
    @Query('includePrivate') includePrivate?: string,
  ): Promise<{
    subCategoryId: number;
    category: string | null;
    subCategory: string;
    accountId: number | null;
    isPrivate: boolean;
    approvalStatus: string;
    ownerType: string;
    accountCode: string | null;
    accountName: string | null;
    sectionCode: string | null;
    sectionName: string | null;
    vatPercent: number | null;
    taxPercent: number | null;
    reductionPercent: number | null;
    isEquipment: boolean | null;
  }[]> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
    if (!businessNumber?.trim()) throw new BadRequestException('businessNumber is required');
    const rows = await this.catalogService.getMergedExpenseCatalog(
      await this.catalogContextService.forUser(firebaseId, businessNumber.trim()),
    );
    return rows
      .filter((s) => includePrivate === 'true' || !s.isPrivate)
      .map((s) => ({
        subCategoryId: s.id,
        category: s.category?.name ?? null,
        subCategory: s.name,
        // Phase 6.2: the D9 simple picker ("למה ההוצאה שייכת?") sends the
        // picked row's card id as the new sub_category's mapping. NULL =
        // unmapped row (MISSING_ACCOUNTING_MAPPING) — not pickable.
        accountId: s.accountId ?? null,
        isPrivate: !!s.isPrivate,
        approvalStatus: s.approvalStatus,
        ownerType: s.ownerType,
        accountCode: s.account?.code ?? null,
        accountName: s.account?.name ?? null,
        sectionCode: s.account?.section?.code ?? null,
        sectionName: s.account?.section?.name ?? null,
        vatPercent: s.account?.vatPercent != null ? Number(s.account.vatPercent) : null,
        taxPercent: s.account?.taxPercent != null ? Number(s.account.taxPercent) : null,
        reductionPercent: s.account?.reductionPercent != null ? Number(s.account.reductionPercent) : null,
        isEquipment: s.account?.isEquipment ?? null,
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
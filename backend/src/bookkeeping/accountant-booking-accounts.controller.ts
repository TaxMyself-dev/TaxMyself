import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { ActivateClientBookingAccountDto } from './dto/activate-booking-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { OwnerType, VisibilityScope } from 'src/enum';

/**
 * Form 6111 reference-card project, Phase 2 (2026-08-13, extended
 * 2026-08-17) — accountant-facing counterpart to
 * AdminBookingAccountsController: browse the reference catalog for one
 * client business, activate a card into that business's own CLIENT-scoped
 * chart, and — as of 2026-08-17 — edit/deactivate cards the accountant
 * already owns for this business (CLIENT_<businessNumber> or their own
 * ACCOUNTANT_<agentId>), never a SYSTEM row. Thin routing/permission layer
 * only — every route calls the same shared CatalogService methods the admin
 * controller and the existing D11 add-account flow already use.
 */
@Controller('accountant/business/:businessNumber/booking-accounts')
export class AccountantBookingAccountsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogContextService: CatalogContextService,
  ) {}

  /**
   * The chartOwnerKeys this accountant is allowed to WRITE for this
   * business — CLIENT_<businessNumber> (the business's own chart) and their
   * own ACCOUNTANT_<actorFirebaseId> chart (shared across all their
   * clients, but still theirs to edit). Deliberately NOT the full D4 read
   * precedence list (chartOwnerKeysFor) — that also includes SYSTEM and
   * OTHER accountants' ACCOUNTANT_<id> charts when a business has multiple
   * delegations, both of which are visible-but-not-writable here. Passed as
   * the explicit `allowedChartOwnerKeys` argument to
   * updateAccountFields/deactivateAccount/getAccountUsage — see those
   * methods' own comments for why this is a required parameter rather than
   * inferred inside them.
   */
  private ownedChartOwnerKeys(businessNumber: string, actorFirebaseId: string): string[] {
    return [`CLIENT_${businessNumber}`, `ACCOUNTANT_${actorFirebaseId}`];
  }

  /** (a) the business's current effective catalog (CLIENT > ACCOUNTANT >
   *  SYSTEM merge, D4), (b) the browsable Form 6111 reference catalog an
   *  accountant can activate a card from for this client, (c) — since
   *  2026-08-17 — the business's own active CLIENT/ACCOUNTANT-owned cards
   *  in full IBookingAccountRow shape, so the catalog tab has something to
   *  render edit/deactivate actions against (previously only `subCategories`
   *  carried a thin accountId/accountCode/accountName pointer — not enough
   *  to populate an edit dialog, and PRIVATE sub_categories have no account
   *  at all). */
  @Get('catalog')
  @UseGuards(FirebaseAuthGuard)
  async getCatalog(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול לצפות בתרשים חשבונות הלקוח');
    }

    // forUser() asserts business ownership internally (the effective/
    // possibly-impersonated firebaseId must own businessNumber).
    const ctx = await this.catalogContextService.forUser(request.user?.firebaseId, businessNumber);
    // getMergedSubCategories is per-categoryId (not a fit for "the whole
    // catalog"); getMergedExpenseCatalog is the existing flat merge across
    // ALL categories at once — the same method GET /bookkeeping/expense-catalog
    // already uses for this exact shape of request.
    const [categories, subCategories, referenceCards, ownedAccounts] = await Promise.all([
      this.catalogService.getMergedCategories(ctx),
      this.catalogService.getMergedExpenseCatalog(ctx),
      // Every isActive=false SYSTEM row is, today, exactly the 321 Form 6111
      // reference cards (the operational SYSTEM chart is all isActive=true)
      // — reusing the same admin-listing method rather than a parallel query.
      this.catalogService.listAccountsForAdmin({ ownerType: OwnerType.SYSTEM, isActive: false }),
      // This business's own writable cards (not the D4 read-merge — just
      // this business's CLIENT chart + this actor's ACCOUNTANT chart, the
      // same allow-list ownedChartOwnerKeys() computes for the write routes
      // below). isActive: true only — a deactivated card has no further
      // action available on it here (no reactivate flow exists), so
      // there's nothing useful to show for an inactive owned row.
      this.catalogService.listAccountsForAdmin({
        chartOwnerKeys: this.ownedChartOwnerKeys(businessNumber, actorFirebaseId),
        isActive: true,
      }),
    ]);
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      subCategories: subCategories.map((s) => ({
        id: s.id,
        name: s.name,
        categoryId: s.categoryId,
        categoryName: s.category?.name ?? null,
        accountId: s.accountId,
        isPrivate: s.isPrivate,
        approvalStatus: s.approvalStatus,
        ownerType: s.ownerType,
        accountCode: s.account?.code ?? null,
        accountName: s.account?.name ?? null,
      })),
      referenceCards,
      ownedAccounts,
    };
  }

  /**
   * Direct in-place edit of an existing card's own fields — accountant
   * counterpart to PATCH admin/booking-accounts/:id, restricted to cards
   * this accountant owns for this business. The ownership check itself
   * lives inside CatalogService.updateAccountFields (see its comment) —
   * this controller's only job is to verify business access and compute the
   * correct allow-list to pass in.
   */
  @Patch(':id')
  @UseGuards(FirebaseAuthGuard)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול לערוך כרטיס');
    }
    await this.catalogContextService.assertBusinessAccess(request.user?.firebaseId, businessNumber);

    return this.catalogService.updateAccountFields(
      id,
      dto,
      this.ownedChartOwnerKeys(businessNumber, actorFirebaseId),
    );
  }

  /**
   * Impact count before an accountant edits one of their own cards — same
   * shape/purpose as GET bookkeeping/accounts/:id/usage, restricted to
   * cards this accountant owns for this business.
   */
  @Get(':id/usage')
  @UseGuards(FirebaseAuthGuard)
  async usage(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול לצפות במידע על כרטיס');
    }
    await this.catalogContextService.assertBusinessAccess(request.user?.firebaseId, businessNumber);

    return this.catalogService.getAccountUsage(id, this.ownedChartOwnerKeys(businessNumber, actorFirebaseId));
  }

  /**
   * Deactivate an already-active card this accountant owns for this
   * business — same blocking-sub_category guard as the admin route,
   * restricted to owned rows.
   */
  @Patch(':id/deactivate')
  @UseGuards(FirebaseAuthGuard)
  async deactivate(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול להשבית כרטיס');
    }
    await this.catalogContextService.assertBusinessAccess(request.user?.firebaseId, businessNumber);

    return this.catalogService.deactivateAccount(id, this.ownedChartOwnerKeys(businessNumber, actorFirebaseId));
  }

  /** Activate a reference card into a CLIENT-owned card for this business —
   *  same shape as the admin endpoint, but scope = CLIENT_${businessNumber}
   *  with accountantId=creator (D4: "creator when accountant created for a
   *  client"), mirroring POST /bookkeeping/accounts' CURRENT_CLIENT branch. */
  @Post('activate')
  @UseGuards(FirebaseAuthGuard)
  async activate(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
    @Body() dto: ActivateClientBookingAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAccountantOrAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק רואה חשבון (או מנהל מערכת) יכול להפעיל כרטיס ייחוס עבור לקוח');
    }
    await this.catalogContextService.assertBusinessAccess(request.user?.firebaseId, businessNumber);

    const scope = this.catalogService.buildScope(OwnerType.CLIENT, {
      userId: request.user?.firebaseId,
      businessNumber,
    });
    scope.accountantId = actorFirebaseId;
    scope.visibilityScope = VisibilityScope.SPECIFIC_CLIENT;

    const { account, subCategory } = await this.catalogService.activateReferenceCard({
      referenceAccountId: dto.referenceAccountId,
      scope,
      type: dto.type,
      sectionId: dto.sectionId,
      law: {
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        recognitionType: dto.recognitionType,
      },
      categoryName: dto.categoryName,
      createdByUserId: actorFirebaseId,
      visibleBusinessTypes: dto.visibleBusinessTypes,
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
        reportScope: account.reportScope,
        ownerType: account.ownerType,
        chartOwnerKey: account.chartOwnerKey,
        visibleBusinessTypes: account.visibleBusinessTypes,
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
}

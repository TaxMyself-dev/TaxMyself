import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { ActivateClientBookingAccountDto } from './dto/activate-booking-account.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { OwnerType, VisibilityScope } from 'src/enum';

/**
 * Form 6111 reference-card project, Phase 2 (2026-08-13) — accountant-facing
 * counterpart to AdminBookingAccountsController: browse the reference
 * catalog for one client business and activate a card into that business's
 * own CLIENT-scoped chart. Thin routing/permission layer only — both routes
 * call the same shared CatalogService methods the admin controller and the
 * existing D11 add-account flow already use.
 */
@Controller('accountant/business/:businessNumber/booking-accounts')
export class AccountantBookingAccountsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogContextService: CatalogContextService,
  ) {}

  /** (a) the business's current effective catalog (CLIENT > ACCOUNTANT >
   *  SYSTEM merge, D4), (b) the browsable Form 6111 reference catalog an
   *  accountant can activate a card from for this client. */
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
    const [categories, subCategories, referenceCards] = await Promise.all([
      this.catalogService.getMergedCategories(ctx),
      this.catalogService.getMergedExpenseCatalog(ctx),
      // Every isActive=false SYSTEM row is, today, exactly the 321 Form 6111
      // reference cards (the operational SYSTEM chart is all isActive=true)
      // — reusing the same admin-listing method rather than a parallel query.
      this.catalogService.listAccountsForAdmin({ ownerType: OwnerType.SYSTEM, isActive: false }),
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
    };
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

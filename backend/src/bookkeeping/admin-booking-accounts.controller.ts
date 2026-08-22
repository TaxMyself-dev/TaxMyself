import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { ActivateBookingAccountDto } from './dto/activate-booking-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { FormPart, OwnerType } from 'src/enum';

/**
 * Form 6111 reference-card project, Phase 2 (2026-08-13) — admin-only
 * management of the SYSTEM chart: browse all 68 operational + 321 reference
 * cards, edit an already-active card in place, activate a reference card
 * into a real operational card, or deactivate one. Thin routing/permission
 * layer only — every write goes through the shared CatalogService methods
 * also used by POST/PATCH /bookkeeping/accounts and the D11 accountant
 * add-account flow; nothing here duplicates that logic.
 */
@Controller('admin/booking-accounts')
export class AdminBookingAccountsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogContextService: CatalogContextService,
  ) {}

  /** All chartOwnerKey='SYSTEM' rows (68 operational + 321 reference),
   *  filterable by formPart/isActive/search. isActive omitted = both. */
  @Get()
  @UseGuards(FirebaseAuthGuard)
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('formPart') formPart?: FormPart,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול לצפות במסך ניהול כרטיסי טופס 6111');
    }
    const rows = await this.catalogService.listAccountsForAdmin({
      ownerType: OwnerType.SYSTEM,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      formPart: formPart && Object.values(FormPart).includes(formPart) ? formPart : undefined,
      search: search?.trim() || undefined,
    });
    // Inactive `6111-*` rows are browsable reference cards. Any other
    // inactive row was soft-deleted and must stay out of the management
    // table even after a refresh.
    return rows.filter((row) => row.isActive || row.code.startsWith('6111-'));
  }

  /** Edit an already-active operational SYSTEM card's law fields — reuses
   *  the same CatalogService method PATCH /bookkeeping/accounts/:id already
   *  uses (which now also refuses '6111-%' reference rows). */
  @Patch(':id')
  @UseGuards(FirebaseAuthGuard)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול לערוך כרטיס ישירות');
    }
    // null = unrestricted — this controller is isAdmin-gated above, so the
    // caller is trusted with any row including SYSTEM. See
    // CatalogService.updateAccountFields's own comment for the full contract.
    return this.catalogService.updateAccountFields(id, dto, null);
  }

  /** Soft-delete an operational SYSTEM card. The row is retained for
   *  accounting history and seed idempotency, but disappears from active
   *  catalogs. CatalogService refuses the operation while any
   *  sub_category (active or inactive) still points at the card. */
  @Delete(':id')
  @UseGuards(FirebaseAuthGuard)
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול למחוק כרטיס');
    }
    return this.catalogService.deactivateAccount(id, null, 'למחוק');
  }

  /** Activate a reference card (`:id` — a `code LIKE '6111-%'` row) into a
   *  real SYSTEM operational card + paired sub_category, one atomic call. */
  @Post(':id/activate')
  @UseGuards(FirebaseAuthGuard)
  async activate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivateBookingAccountDto,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול להפעיל כרטיס ייחוס');
    }

    const scope = this.catalogService.buildScope(OwnerType.SYSTEM, {});
    const { account, subCategory } = await this.catalogService.activateReferenceCard({
      referenceAccountId: id,
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

  /** Deactivate an already-active SYSTEM card — refuses (409) with the
   *  blocking sub_category list if any row still points at it. */
  @Patch(':id/deactivate')
  @UseGuards(FirebaseAuthGuard)
  async deactivate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    if (!actorFirebaseId) throw new UnauthorizedException('Not authenticated');
    if (!(await this.catalogContextService.isAdmin(actorFirebaseId))) {
      throw new ForbiddenException('רק מנהל מערכת יכול להשבית כרטיס');
    }
    // null = unrestricted — admin-gated above, trusted with any row.
    return this.catalogService.deactivateAccount(id, null, 'להשבית');
  }
}

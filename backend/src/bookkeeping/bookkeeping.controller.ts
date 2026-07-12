import { BadRequestException, Body, Controller, Get, Headers, Param, ParseArrayPipe, ParseIntPipe, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards, } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';
import { CatalogService } from './catalog.service';
import { CatalogContextService } from './catalog-context.service';
import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { RepointSubCategoryAccountDto } from './dto/repoint-sub-category-account.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';



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
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

/** PATCH expenses/:id/reclassify (Phase 4.2 / D10) — card law only:
 *  picking a sub_category IS the classification, no percent overrides. */
export class ReclassifyExpenseDto {
  @IsNumber()
  subCategoryId: number;
}

/** PATCH expenses/:id/override-mapping (Phase 4.2 / D10) — exactly one of
 *  accountId / accountCode (validated in the service). */
export class OverrideExpenseMappingDto {
  @IsOptional()
  @IsNumber()
  accountId?: number;

  @IsOptional()
  @IsString()
  accountCode?: string;
}

/**
 * POST expenses/:id/complete-mapping (Phase 5.3 / D9's inline completion
 * row). The "החל גם על סיווגים עתידיים" checkbox maps to applyToFuture:
 * true → the expense's sub_category is repointed at the card (future
 * classifications follow) + this expense is re-resolved, approved and
 * journaled; false/omitted → one-off snapshot override on this expense
 * only (the 4.2 override-mapping path).
 */
export class CompleteExpenseMappingDto {
  @IsNumber()
  accountId: number;

  @IsOptional()
  @IsBoolean()
  applyToFuture?: boolean;
}

import { IsNumber, IsOptional, IsString } from 'class-validator';

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

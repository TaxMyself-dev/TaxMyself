import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RecognitionType, ExpenseReportScope, BusinessFieldType } from 'src/enum';

/**
 * PATCH /bookkeeping/accounts/:id (admin-only "כרטיסים" screen): a direct
 * in-place edit of an existing card's own fields. Unlike
 * CatalogService.updateSubCategoryLaw (D10 — a sub_category law edit never
 * mutates its card, it repoints to a variant), this DOES mutate the
 * booking_account row — it's the deliberate direct-editing tool the D10
 * comment presupposes doesn't otherwise exist. Every field on a SYSTEM (or
 * any shared) card is consequently a global-impact edit; the frontend shows
 * the usage count (GET accounts/:id/usage) before calling this.
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(/^\d{1,15}$/, { message: 'code must be a numeric string' })
  code?: string;

  @IsOptional()
  @IsInt()
  sectionId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code6111?: string | null;

  @IsOptional()
  @IsEnum(RecognitionType)
  recognitionType?: RecognitionType;

  @IsOptional()
  @IsNumber()
  vatPercent?: number;

  @IsOptional()
  @IsNumber()
  taxPercent?: number;

  @IsOptional()
  @IsNumber()
  reductionPercent?: number;

  @IsOptional()
  @IsBoolean()
  isEquipment?: boolean;

  /** Which report this card feeds — PNL / ANNUAL / TECHNICAL (model change,
   *  2026-07-14). Admin-only correction tool; not exposed on CreateAccountDto
   *  since D11 accountant/client-created cards are always PNL. */
  @IsOptional()
  @IsEnum(ExpenseReportScope)
  reportScope?: ExpenseReportScope;

  /** Phase 3 Step 3 (2026-08-17, revised model): edit which business types
   *  see this card. Omit to leave unchanged; when provided, must be
   *  non-empty — clearing a card to "visible to nobody" via edit isn't
   *  allowed (same "at least one type required" rule as activation/create;
   *  deactivate the card instead to fully hide it). */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'at least one business type must be selected' })
  @IsEnum(BusinessFieldType, { each: true })
  visibleBusinessTypes?: BusinessFieldType[];
}

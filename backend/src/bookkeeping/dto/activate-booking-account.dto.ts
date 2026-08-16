import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsString, MaxLength } from 'class-validator';
import { RecognitionType, BusinessFieldType } from 'src/enum';

/**
 * Form 6111 reference-card project, Phase 2 (2026-08-13): body for
 * POST .../booking-accounts/:id/activate (admin) — turns a reference card
 * (isActive=false, code LIKE '6111-%') into a real operational
 * booking_account + paired sub_category via
 * CatalogService.activateReferenceCard, one atomic call.
 *
 * Every field is REQUIRED, unlike CreateAccountDto's optionality for the
 * generic D11 add-account flow — no defaults are invented here. In
 * particular `type`/`sectionId` can't be sourced from the reference row
 * (both are NULL on all 321 of them, and the source CSV never carried
 * either) or derived from formPart (a formPart='A' reference row can be
 * either an income or an expense line) — the admin picks them explicitly,
 * same as the existing POST /bookkeeping/accounts flow already requires
 * for sectionId.
 */
export class ActivateBookingAccountDto {
  @IsIn(['expense', 'income'])
  type: 'expense' | 'income';

  @IsInt()
  sectionId: number;

  @IsNumber()
  vatPercent: number;

  @IsNumber()
  taxPercent: number;

  @IsNumber()
  reductionPercent: number;

  @IsBoolean()
  isEquipment: boolean;

  @IsEnum(RecognitionType)
  recognitionType: RecognitionType;

  /** Parent category for the paired sub_category — pre-filled by the
   *  frontend from the reference row's stored `category` value, editable. */
  @IsString()
  @MaxLength(120)
  categoryName: string;

  /** Phase 3 Step 3 (2026-08-17, revised model): which business types can
   *  see the activated card (visibility filter, independent of the
   *  CLIENT/ACCOUNTANT/SYSTEM ownership scope). Required, at least one — an
   *  activated-but-empty card would be visible to nobody, which defeats the
   *  point of deliberately activating it. */
  @IsArray()
  @ArrayNotEmpty({ message: 'at least one business type must be selected' })
  @IsEnum(BusinessFieldType, { each: true })
  visibleBusinessTypes: BusinessFieldType[];
}

/**
 * POST /accountant/business/:businessNumber/booking-accounts/activate: same
 * body as the admin endpoint, but the reference card's id travels in the
 * body (this route has no `:id` segment — see prompt-phase2-build-v2.md
 * endpoint 5) rather than the URL.
 */
export class ActivateClientBookingAccountDto extends ActivateBookingAccountDto {
  @IsInt()
  referenceAccountId: number;
}

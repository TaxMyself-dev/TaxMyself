import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RecognitionType } from 'src/enum';

/** D11 "available for" — decides the created rows' owner scope. */
export enum AccountAvailability {
  /** ACCOUNTANT-owned rows (70000-range code), visible to all the
   *  accountant's clients (visibilityScope=ALL_ACCOUNTANT_CLIENTS). */
  ALL_MY_CLIENTS = 'ALL_MY_CLIENTS',
  /** CLIENT-owned rows (80000-range code) for the currently-impersonated
   *  business; accountantId records the creator (D4),
   *  visibilityScope=SPECIFIC_CLIENT. */
  CURRENT_CLIENT = 'CURRENT_CLIENT',
}

/**
 * POST /bookkeeping/accounts (Phase 5.2 / D11): all accounting law lives ON
 * THE ACCOUNT (revised D1) — the paired sub_category is a thin same-named
 * pointer so clients can select the card when classifying.
 */
export class CreateAccountDto {
  @IsString()
  @MaxLength(120)
  name: string;

  /** Manual code override — auto-allocated in the owner's range (jumps of
   *  10) when omitted. Must be unique within the owner's chartOwnerKey. */
  @IsOptional()
  @Matches(/^\d{1,15}$/, { message: 'code must be a numeric string' })
  code?: string;

  @IsInt()
  sectionId: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code6111?: string | null;

  @IsOptional()
  @IsEnum(RecognitionType)
  recognitionType?: RecognitionType;

  @IsNumber()
  vatPercent: number;

  @IsNumber()
  taxPercent: number;

  @IsOptional()
  @IsNumber()
  reductionPercent?: number;

  @IsOptional()
  @IsBoolean()
  isEquipment?: boolean;

  @IsEnum(AccountAvailability)
  availableFor: AccountAvailability;

  /** "כרטיס טכני בלבד" — account row only, no paired sub_category (for
   *  manual journal-entry targets clients never classify to). */
  @IsOptional()
  @IsBoolean()
  technicalOnly?: boolean;

  /** Parent category for the paired sub_category (required unless
   *  technicalOnly) — resolved by name against the visible scopes, created
   *  in the target scope when missing. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: 'expense' | 'income';
}

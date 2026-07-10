import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export type ManualJournalEntryKind = 'income' | 'income_exempt' | 'expense';

export class ManualJournalLineDto {
  /** Required for `expense` only — the service forces income/income_exempt
   *  to '4000' regardless of what's sent here, so it's optional at the DTO
   *  level and validated conditionally in the service. */
  @IsOptional()
  @IsString()
  accountCode?: string;

  /** The line's posted amount — GROSS (total including VAT), matching
   *  Expense.sum's convention. NOT net, unlike the automatic EXPENSE/document
   *  postings — the service derives net/vatAmount from this total using the
   *  effective VAT rate and vatPercent. */
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  subCategoryName?: string | null;

  @IsOptional()
  @IsBoolean()
  isEquipment?: boolean;

  /** % recognized for VAT (0-100), expense only. Fixed at 100 for income and
   *  0 for income_exempt regardless of what's sent here. */
  @IsOptional()
  @IsNumber()
  vatPercent?: number;

  /** % recognized for income tax (0-100), expense only — replaces the old
   *  hardcoded 100. Defaults to 100 if omitted. Fixed at 100 for
   *  income/income_exempt regardless of what's sent here. */
  @IsOptional()
  @IsNumber()
  taxPercent?: number;
}

export class CreateManualJournalEntryDto {
  @IsIn(['income', 'income_exempt', 'expense'])
  entryKind: ManualJournalEntryKind;

  @IsOptional()
  @IsString()
  businessNumber?: string;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  valueDate?: string;

  @IsOptional()
  @IsString()
  vatDate?: string;

  /** אסמכתא — free-text reference (invoice/receipt number etc). Maps
   *  directly to JournalEntry.description with no auto-generated text,
   *  unlike the computed descriptions EXPENSE/document entries get. */
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** VAT/income reporting-period label ("3/2026" etc). Required for `income`;
   *  required for `expense` only when a line's derived vatAmount > 0; forced
   *  null for `income_exempt`. */
  @IsOptional()
  @IsString()
  vatReportingPeriod?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualJournalLineDto)
  lines: ManualJournalLineDto[];
}

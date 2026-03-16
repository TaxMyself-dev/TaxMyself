import { IsBoolean, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/**
 * DTO for the classifyManually() operation.
 *
 * billId is NOT supplied by the caller – it is read from the existing
 * full_transactions_cache row.  A transaction without a billId cannot
 * be classified (enforced in the service).
 */
export class ClassifyManuallyDto {
  @IsString()
  @IsNotEmpty()
  externalTransactionId: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  subCategory: string;

  @IsInt()
  @Min(0)
  @Max(100)
  vatPercent: number;

  @IsInt()
  @Min(0)
  @Max(100)
  taxPercent: number;

  @IsInt()
  @Min(0)
  @Max(100)
  reductionPercent: number;

  @IsBoolean()
  isEquipment: boolean;

  @IsBoolean()
  isRecognized: boolean;
}

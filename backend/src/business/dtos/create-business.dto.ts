import { IsNumber, IsOptional, IsString, Matches, Min, Max } from 'class-validator';

// Header-safe (ISO-8859-1) and digits-only — AuthInterceptor forwards this
// value verbatim as the `businessnumber` HTTP header on every request while
// it's active, so anything outside plain ASCII digits breaks request
// dispatch for the rest of the session (XMLHttpRequest.setRequestHeader
// throws synchronously on non-Latin1 values).
const BUSINESS_NUMBER_PATTERN = /^\d*$/;
const BUSINESS_NUMBER_MESSAGE = 'מספר עסק חייב להכיל ספרות בלבד';

export class CreateBusinessDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  @Matches(BUSINESS_NUMBER_PATTERN, { message: BUSINESS_NUMBER_MESSAGE })
  businessNumber?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @IsString()
  businessPhone?: string;

  @IsOptional()
  @IsString()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  businessField?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  advanceTaxPercent?: number;
}

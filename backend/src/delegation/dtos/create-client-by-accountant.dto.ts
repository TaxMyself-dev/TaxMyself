import { IsEmail, IsOptional, IsString, IsNotEmpty, IsEnum, Matches } from 'class-validator';
import { BusinessType } from 'src/enum';

// Header-safe (ISO-8859-1) and digits-only — AuthInterceptor forwards this
// value verbatim as the `businessnumber` HTTP header on every request while
// it's active, so anything outside plain ASCII digits breaks request
// dispatch for the rest of the session (XMLHttpRequest.setRequestHeader
// throws synchronously on non-Latin1 values).
const BUSINESS_NUMBER_PATTERN = /^\d*$/;
const BUSINESS_NUMBER_MESSAGE = 'מספר עסק חייב להכיל ספרות בלבד';

/**
 * DTO for creating a new client by an accountant (רואה חשבון).
 * Client is created in Firebase (email + password = "KE" + phone) and in local User + Delegation tables.
 */
export class CreateClientByAccountantDto {
  @IsNotEmpty({ message: 'אימייל חובה' })
  @IsEmail({}, { message: 'כתובת אימייל לא חוקית' })
  email: string;

  @IsNotEmpty({ message: 'פלאפון חובה' })
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  fName?: string;

  @IsOptional()
  @IsString()
  lName?: string;

  @IsOptional()
  @IsString()
  id?: string;

  /** תאריך לידה (YYYY-MM-DD או ISO string) */
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  /** סוג העסק: עוסק פטור, עוסק מורשה, חברה בע"מ */
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  /** שם העסק */
  @IsOptional()
  @IsString()
  businessName?: string;

  /** מספר עסק */
  @IsOptional()
  @IsString()
  @Matches(BUSINESS_NUMBER_PATTERN, { message: BUSINESS_NUMBER_MESSAGE })
  businessNumber?: string;

  /** כתובת */
  @IsOptional()
  @IsString()
  address?: string;
}

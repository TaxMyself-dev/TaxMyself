import { IsEmail, IsOptional, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { BusinessType } from 'src/enum';

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
  businessNumber?: string;

  /** כתובת */
  @IsOptional()
  @IsString()
  address?: string;
}

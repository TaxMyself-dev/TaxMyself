import { IsEmail, IsOptional, IsString, IsNotEmpty } from 'class-validator';

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
}

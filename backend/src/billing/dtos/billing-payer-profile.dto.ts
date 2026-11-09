import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class UpdateBillingPayerProfileDto {
  @IsString()
  @Length(2, 255)
  fullName: string;

  @IsString()
  @Length(5, 32)
  @Matches(/^\d+$/, { message: 'identityNumber must contain digits only' })
  identityNumber: string;

  @IsEmail()
  @Length(3, 255)
  email: string;

  @IsString()
  @Length(7, 32)
  @Matches(/^[+\d][\d\s()-]+$/, { message: 'phone has an invalid format' })
  phone: string;

  @IsString()
  @Length(5, 32)
  @Matches(/^\d+$/, { message: 'businessNumber must contain digits only' })
  businessNumber: string;
}

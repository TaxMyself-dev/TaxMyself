import { IsEmail, IsOptional, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { BusinessType } from '../../enum';

export class RegisterCustomerDto {

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsString()
  phone?: string;

  @IsNotEmpty()
  @IsString()
  fName?: string;

  @IsNotEmpty()
  @IsString()
  lName?: string;

  @IsOptional()
  @IsString()
  city?: string; // מקום מגורים (אופציונלי)

  // Business fields
  @IsNotEmpty()
  @IsString()
  businessName?: string;

  @IsNotEmpty()
  @IsString()
  businessNumber?: string;

  @IsNotEmpty()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsNotEmpty()
  @IsString()
  businessAddress?: string; // כתובת העסק (חובה)

}


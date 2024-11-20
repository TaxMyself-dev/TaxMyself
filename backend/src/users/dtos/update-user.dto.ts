import { IsString, IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() fName?: string;
  @IsOptional() @IsString() lName?: string;
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsDateString() dateOfBirth?: Date;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() spouseFName?: string;
  @IsOptional() @IsString() spouseLName?: string;
  @IsOptional() @IsString() spouseId?: string;
  @IsOptional() @IsDateString() spouseDateOfBirth?: Date;
  @IsOptional() @IsBoolean() spouseIndependet?: boolean;
  @IsOptional() @IsString() businessName?: string;
  @IsOptional() @IsString() businessField?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() businessNumber?: string;
  @IsOptional() @IsBoolean() businessInventory?: boolean;
  @IsOptional() @IsDateString() businessDate?: string;
  @IsOptional() @IsBoolean() employee?: boolean;
  @IsOptional() @IsString() familyStatus?: string;
}
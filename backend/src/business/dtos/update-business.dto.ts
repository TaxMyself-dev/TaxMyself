import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpdateBusinessDto {
  @IsString()
  businessNumber: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  advanceTaxPercent?: number;
}

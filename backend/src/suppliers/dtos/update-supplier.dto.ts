import {
    IsOptional,
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export class UpdateSupplierDto {

    @IsString()
    token: string;

    @IsOptional()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    category: string;

    @IsOptional()
    @IsString()
    subCategory: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    taxPercent: number;
  
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    vatPercent: number;

}
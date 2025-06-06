import {
    IsOptional,
    IsString,
    IsNumber,
    Min,
    Max,
    IsBoolean
} from 'class-validator'

export class UpdateSupplierDto {

    @IsOptional()
    @IsString()
    supplier: string;

    @IsOptional()
    @IsString()
    category: string;

    @IsOptional()
    @IsString()
    subCategory: string;

    @IsOptional()
    @IsString()
    supplierID: string;

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

    @IsOptional()
    @IsBoolean()
    isEquipment: boolean;

    @IsOptional()
    @IsNumber()
    reductionPercent: number;

}
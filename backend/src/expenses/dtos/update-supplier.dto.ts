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

    @IsString()
    businessNumber: string;

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

    /** Phase 6.3: FK pointer at the classified sub_category — the string
     *  category/subCategory pair above stays as the display copy. */
    @IsOptional()
    @IsNumber()
    subCategoryId?: number | null;

}
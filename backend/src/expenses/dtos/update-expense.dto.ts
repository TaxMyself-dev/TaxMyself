import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional
} from 'class-validator'

export class UpdateExpenseDto {

    @IsString()
    token: string;

    @IsOptional()
    @IsString()
    supplier: string;

    @IsOptional()
    @IsNumber()
    supplierId: number;
    
    @IsOptional()
    @IsString()
    category: string;

    @IsOptional()
    @IsString()
    subCategory: string;

    @IsOptional()
    @IsNumber()
    sum: number;
    
    @IsOptional()
    @IsNumber()
    taxPercent: number;
    
    @IsOptional()
    @IsNumber()
    vatPercent: number;
    
    @IsOptional()
    @IsString()
    date: string
    
    @IsOptional()
    @IsString()
    note: string;
    
    @IsOptional()
    @IsString()
    file: string;
    
    @IsOptional()
    @IsBoolean()
    isEquipment: boolean;

    @IsNumber()
    taxSumRec: number;

    @IsNumber()
    vatSumRec: number;
    
}
import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional
} from 'class-validator'


export class CreateExpenseDto {


    @IsString()
    supplier: string;

    @IsOptional()
    @IsString()
    supplierID: string;

    @IsOptional()
    @IsString()
    expenseNumber: string;

    @IsString()
    category: string;

    @IsString()
    subCategory: string;

    @IsNumber()
    sum: number;

    @IsNumber()
    taxPercent: number;

    @IsNumber()
    vatPercent: number;

    @IsDateString()
    date: Date;

    @IsOptional()
    @IsString()
    note: string;

    @IsOptional()
    @IsString()
    file: string;

    // @IsOptional()
    // @IsBoolean()
    // isEquipment: boolean;

    // @IsOptional()
    // @IsString()
    // equipmentCategory: string;

    @IsOptional()
    @IsNumber()
    reductionPercent: number;
}
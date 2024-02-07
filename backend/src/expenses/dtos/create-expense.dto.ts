import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean,
    IsOptional,
    IsDate
} from 'class-validator'


export class CreateExpenseDto {


    @IsString()
    token: string;

    @IsString()
    supplier: string;

    @IsString()
    supplierID: string;

    @IsString()
    expenseNumber:string;
    
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
    
    @IsString()
    date: Date
    
    @IsOptional()
    @IsString()
    note: string;
    
    @IsOptional()
    @IsString()
    file: string;
    
    @IsOptional()
    @IsBoolean()
    isEquipment: boolean;

    @IsOptional()
    @IsString()
    equipmentCategory: string;

    @IsOptional()
    @IsNumber()
    reductionPercent: number;
}
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsEnum,
    IsOptional
} from 'class-validator'
import { ExpenseReportScope } from 'src/enum';

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

    /** Per-expense report scope (edited from the bookkeeping Edit dialog). */
    @IsOptional()
    @IsEnum(ExpenseReportScope)
    reportScope?: ExpenseReportScope;

    /** Optional per-expense P&L-category override (rare). null clears it. */
    @IsOptional()
    @IsString()
    pnlCategory?: string | null;

    @IsNumber()
    taxSumRec: number;

    @IsNumber()
    vatSumRec: number;
    
}
import { IsString, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ExpenseDto {
    @IsString()
    category: string;

    @IsNumber()
    total: number;
}

export class PnLReportDto {
    @IsNumber()
    income: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExpenseDto)
    expenses: ExpenseDto[];
}
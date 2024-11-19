import { IsString, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExpensePnlDto {
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
    @Type(() => ExpensePnlDto)
    expenses: ExpensePnlDto[];

    @IsNumber()
    netProfitBeforeTax: number;

}
import { IsString, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExpensePnlDto {
    /** Accounting-section name the expenses roll up under (D3 — the section
     *  replaced the old pnlCategory string namespace in Phase 4.4; the field
     *  was named `category` until then). */
    @IsString()
    sectionName: string;

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
import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean
} from 'class-validator'

export class CreateExpenseDto {

    @IsNumber()
    @Min(0)
    @Max(1000000)
    price: number;

    @IsDateString()
    date: string;

    @IsString()
    supplier: string;

    @IsString()
    category: string;

    @IsNumber()
    @Min(0)
    @Max(100)
    tax_percent: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    vat_percent: number;

    @IsBoolean()
    equipment: boolean;

}
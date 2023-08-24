import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean
} from 'class-validator'

export class CreateExpenseDto {

    @IsDateString()
    date_added: Date;

    @IsNumber()
    price: number;

    @IsDateString()
    date: Date;

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
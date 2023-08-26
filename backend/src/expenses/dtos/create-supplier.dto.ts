import {
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export class CreateSupplierDto {

    @IsString()
    name: string;

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

}
import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean
} from 'class-validator'
import { Transform } from 'class-transformer';

export class GetExpenseDto {

    @Transform(({ value }) => parseInt(value) )
    @IsNumber()
    userId: number;

    @Transform(({ value }) => parseInt(value) )
    @IsNumber()
    @Min(0)
    @Max(1000000)
    price: number;

    //@IsDateString()
    //date: string;

    //@IsString()
    //supplier: string;

    //@IsString()
    //category: string;

    @Transform(({ value }) => parseInt(value) )
    @IsNumber()
    @Min(0)
    @Max(100)
    tax_percent: number;

    //@IsNumber()
    //@Min(0)
    //@Max(100)
    //vat_percent: number;

    //@IsBoolean()
    //equipment: boolean;

}
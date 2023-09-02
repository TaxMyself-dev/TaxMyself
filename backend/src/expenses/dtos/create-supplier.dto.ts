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
    taxPercent: number;
  
    @IsNumber()
    @Min(0)
    @Max(100)
    vatPercent: number;

}
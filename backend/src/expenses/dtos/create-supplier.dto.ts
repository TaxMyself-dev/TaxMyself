import {
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export class CreateSupplierDto {

    @IsString()
    token: string;

    @IsString()
    name: string;

    @IsString()
    supplierID: string;

    @IsString()
    category: string;

    @IsString()
    subCategory: string;

    @IsNumber()
    @Min(0)
    @Max(100)
    taxPercent: number;
  
    @IsNumber()
    @Min(0)
    @Max(100)
    vatPercent: number;

}
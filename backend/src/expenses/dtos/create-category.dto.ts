import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
} from 'class-validator'


export class CreateCategoryDto {

    @IsString()
    token: string;
    
    @IsString()
    subCategory: string;

    @IsString()
    category: string;
    
    @IsNumber()
    taxPercent: number;
    
    @IsNumber()
    vatPercent: number;

    @IsNumber()
    reductionPercent: number;
    
    @IsOptional()
    @IsBoolean()
    isEquipment: boolean;

    @IsOptional()
    @IsBoolean()
    isRecognized: boolean;
    
}
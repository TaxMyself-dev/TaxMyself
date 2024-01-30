import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
} from 'class-validator'


export class UpdateCategoryDto {

    @IsString()
    token: string;
    
    @IsOptional()
    @IsString()
    subCategory: string;

    @IsOptional()
    @IsString()
    category: string;
    
    @IsOptional()
    @IsNumber()
    taxPercent: number;
    
    @IsOptional()
    @IsNumber()
    vatPercent: number;
    
    @IsOptional()
    @IsBoolean()
    isEquipment: boolean;
}
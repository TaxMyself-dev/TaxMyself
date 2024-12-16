import {
    IsBooleanString,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator'


export class GetExpensesDto {

    @IsString()
    @IsOptional()
    startDate: string;

    @IsString()
    @IsOptional()
    endDate: string;

    @IsString()
    @IsOptional()
    pagination: string;
    
    @IsString()
    @IsOptional()
    businessNumber: string;
}
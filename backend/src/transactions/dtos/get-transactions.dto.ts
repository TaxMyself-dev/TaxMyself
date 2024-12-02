import {
    IsBooleanString,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator'


export class GetTransactionsDto {

    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsNotEmpty()
    billId: string;
    
    @IsString()
    @IsOptional()
    businessNumber: string;
}
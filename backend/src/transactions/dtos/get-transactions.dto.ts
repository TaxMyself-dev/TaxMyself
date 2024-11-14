import {
    IsBooleanString,
    IsNotEmpty,
    IsString,
} from 'class-validator'


export class GetTransactionsDto {

    @IsString()
    @IsNotEmpty()
    year: string;

    @IsString()
    @IsNotEmpty()
    month: string;

    @IsBooleanString()
    @IsNotEmpty()
    isSingleMonth: boolean;

    @IsString()
    @IsNotEmpty()
    billId: string;
    
}
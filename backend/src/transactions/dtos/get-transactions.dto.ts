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
    isSingleMonth: boolean; // or boolean, depending on how you handle it

    @IsString()
    @IsNotEmpty()
    billId: string;

    // @IsString()
    // @IsNotEmpty()
    // kuku: string;
    
}
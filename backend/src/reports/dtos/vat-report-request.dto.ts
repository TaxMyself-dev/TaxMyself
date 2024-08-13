import { IsDateString, IsNumber, IsNotEmpty, Validate, IsString, IsBooleanString } from 'class-validator';

class IsNumberString {
    validate(value: string) {
        return !isNaN(Number(value));
    }
}

export class VatReportRequestDto {

    // @IsNotEmpty()
    // @IsDateString()
    // startDate: string;

    // @IsNotEmpty()
    // @IsDateString()
    // endDate: string;

    @IsString()
    @IsNotEmpty()
    year: string;

    @IsString()
    @IsNotEmpty()
    month: string;

    @IsBooleanString()
    @IsNotEmpty()
    isSingleMonth: boolean; // or boolean, depending on how you handle it

    @IsNotEmpty()
    @Validate(IsNumberString)
    vatableTurnover: number;

    @IsNotEmpty()
    @Validate(IsNumberString)
    nonVatableTurnover: number;

}
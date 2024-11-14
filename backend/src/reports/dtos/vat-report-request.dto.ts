import { IsDateString, IsNumber, IsNotEmpty, Validate, IsString, IsBooleanString } from 'class-validator';

class IsNumberString {
    validate(value: string) {
        return !isNaN(Number(value));
    }
}

export class VatReportRequestDto {

    @IsString()
    @IsNotEmpty()
    year: string;

    @IsNotEmpty()
    @Validate(IsNumberString)
    monthReport: number;

    @IsBooleanString()
    @IsNotEmpty()
    isSingleMonth: string;

    @IsNotEmpty()
    @Validate(IsNumberString)
    vatableTurnover: number;

    @IsNotEmpty()
    @Validate(IsNumberString)
    nonVatableTurnover: number;

}
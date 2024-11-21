import { IsDateString, IsNumber, IsNotEmpty, Validate, IsString, IsBooleanString } from 'class-validator';

class IsNumberString {
    validate(value: string) {
        return !isNaN(Number(value));
    }
}

export class VatReportRequestDto {

    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsNotEmpty()
    businessNumber: string;

    @IsNotEmpty()
    @Validate(IsNumberString)
    vatableTurnover: number;

    @IsNotEmpty()
    @Validate(IsNumberString)
    nonVatableTurnover: number;

}
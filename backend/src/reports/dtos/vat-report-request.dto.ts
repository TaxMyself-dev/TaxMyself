import { IsDateString, IsNumber, IsNotEmpty, Validate } from 'class-validator';

class IsNumberString {
    validate(value: string) {
        return !isNaN(Number(value));
    }
}

export class VatReportRequestDto {

    @IsNotEmpty()
    @IsDateString()
    startDate: string;

    @IsNotEmpty()
    @IsDateString()
    endDate: string;

    @IsNotEmpty()
    @Validate(IsNumberString)
    vatableTurnover: number;

    @IsNotEmpty()
    @Validate(IsNumberString)
    nonVatableTurnover: number;

    @IsNotEmpty()
    token: string;

}
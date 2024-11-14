import { IsNotEmpty, Validate, IsString, IsBooleanString } from 'class-validator';

class IsNumberString {
    validate(value: string) {
        return !isNaN(Number(value));
    }
}

export class PnLReportRequestDto {

    @IsString()
    @IsNotEmpty()
    year: string;

    @IsNotEmpty()
    @Validate(IsNumberString)
    monthReport: number;

    @IsBooleanString()
    @IsNotEmpty()
    isSingleMonth: string;

}
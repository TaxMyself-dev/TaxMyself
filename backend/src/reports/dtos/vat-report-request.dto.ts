import { IsDateString, IsNumber, IsNotEmpty, Validate, IsString, IsBooleanString, IsOptional } from 'class-validator';

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

    /** Manual edit of the on-screen "עסקאות חייבות" field — mirrors P&L's
     *  incomeOverride so the exported PDF matches what the user is looking
     *  at instead of re-deriving (usually 0) from the journal. */
    @IsOptional()
    @IsString()
    vatableTurnoverOverride?: string;

    // @IsNotEmpty()
    // @Validate(IsNumberString)
    // vatableTurnover: number;

    // @IsNotEmpty()
    // @Validate(IsNumberString)
    // nonVatableTurnover: number;

}
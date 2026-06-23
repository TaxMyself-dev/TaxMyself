import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Query params for the Form 1342 depreciation report.
 * Year is a 4-digit string (matches how the frontend sends it via HttpParams).
 */
export class DepreciationReportRequestDto {

    @IsString()
    @IsNotEmpty()
    businessNumber: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{4}$/, { message: 'year must be a 4-digit year' })
    year: string;
}

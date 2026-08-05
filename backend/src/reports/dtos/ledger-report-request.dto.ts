import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LedgerReportRequestDto {
    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsNotEmpty()
    businessNumber: string;

    /** When provided, return movements for this account only; otherwise all accounts. */
    @IsOptional()
    @IsString()
    accountCode?: string;
}

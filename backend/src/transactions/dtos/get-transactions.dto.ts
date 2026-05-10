import {
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator'


export class GetTransactionsDto {

    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

    // Repeated query params arrive as string[]; a single param arrives as string.
    // The literal 'null' (string) means "no filter" — see parseListParam.
    @IsOptional()
    billId: string | string[];

    @IsOptional()
    categories: string | string[];

    @IsString()
    @IsOptional()
    businessNumber: string;

    @IsOptional()
    sources: string | string[];
}
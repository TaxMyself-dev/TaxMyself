import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PnLReportRequestDto {

    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsNotEmpty()
    businessNumber: string;

    @IsOptional()
    @IsBoolean()
    osekZair?: boolean;

}

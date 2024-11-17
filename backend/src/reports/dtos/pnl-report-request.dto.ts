import { IsNotEmpty, IsString } from 'class-validator';

export class PnLReportRequestDto {

    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;

}
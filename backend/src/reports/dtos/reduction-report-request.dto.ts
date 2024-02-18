import { IsDateString, IsNotEmpty} from 'class-validator';

export class ReductionReportRequestDto {

    @IsNotEmpty()
    @IsDateString()
    startDate: string;

    @IsNotEmpty()
    @IsDateString()
    endDate: string;

    @IsNotEmpty()
    userId: string;

}
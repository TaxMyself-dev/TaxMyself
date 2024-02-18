import { IsDateString, IsNotEmpty} from 'class-validator';

export class ReductionReportDto {

    @IsNotEmpty()
    category: string;

    @IsNotEmpty()
    billDate: string;

    @IsNotEmpty()
    activeDate: string;

    @IsNotEmpty()
    redunctionPercnet: string;

    @IsNotEmpty()
    redunctionForPeriod: string;

}
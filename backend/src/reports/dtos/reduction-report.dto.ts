import { IsDateString, IsNotEmpty} from 'class-validator';

export class ReductionReportDto {

    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    date: Date;

    @IsNotEmpty()
    redunctionPercent: string;

    @IsNotEmpty()
    currentRedunction: number;

    @IsNotEmpty()
    pastRedunction: number;

}
import { IsDateString, IsNotEmpty} from 'class-validator';

export class DepreciationReportDto {

    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    date: Date;

    @IsNotEmpty()
    depreciationPercent: string;

    @IsNotEmpty()
    currentDepreciation: number;

    @IsNotEmpty()
    pastDepreciation: number;

}
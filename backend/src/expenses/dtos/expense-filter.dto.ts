import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';

export class ExpenseFilterDto {
    @IsNotEmpty()
    @IsDateString()
    startDate: string;

    @IsNotEmpty()
    @IsDateString()
    endDate: string;

    @IsNotEmpty()
    userId: string;
}

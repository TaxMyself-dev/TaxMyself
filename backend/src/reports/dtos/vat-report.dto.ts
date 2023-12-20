import {
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export class VatReportDto {

    @IsNumber()
    taxableTrans17: number;

    @IsNumber()
    taxableTrans18: number;

    @IsNumber()
    exemptTrans: number;

    @IsNumber()
    recognizeExpenses17: number;

    @IsNumber()
    recognizeExpenses18: number;

    @IsNumber()
    recognizeEquipExpenses17: number;

    @IsNumber()
    recognizeEquipExpenses18: number;

}
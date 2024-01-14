import {
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export class VatReportDto {

    @IsNumber()
    vatableTurnover: number;

    @IsNumber()
    nonVatableTurnover: number;

    @IsNumber()
    vatRefundOnAssets: number;

    @IsNumber()
    vatRefundOnExpenses: number;

    @IsNumber()
    vatPayment: number;

}
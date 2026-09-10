import {
    IsString,
    IsNumber,
    Min,
    Max
} from 'class-validator'

export interface VatInputBreakdownRow {
    id: number | null;
    supplier: string;
    date: Date | string;
    sum: number;
    category: string;
    subCategory: string;
    totalVatPayable: number;
    totalTaxPayable: number;
    vatPercent: number;
    taxPercent: number;
    isEquipment: boolean;
    file: string | null;
    sourceDocumentId: number | null;
    sourceDocumentFileName: string | null;
    journalEntryId: number;
    journalLineId: number;
    manualJournalEntry: boolean;
}

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

    @IsNumber()
    vatRate: number;

    /** Exact account-2410 rows used for vatRefundOnExpenses/assets. */
    expenses: VatInputBreakdownRow[];

}

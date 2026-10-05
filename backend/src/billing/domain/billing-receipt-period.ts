export interface BillingReceiptPeriod {
  planName: string;
  periodStart: Date;
  periodEnd: Date;
  amountBeforeVatAgorot: number;
  vatAmountAgorot: number;
  amountIncludingVatAgorot: number;
}

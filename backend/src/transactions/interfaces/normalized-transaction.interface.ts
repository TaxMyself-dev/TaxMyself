export interface NormalizedTransaction {
  externalTransactionId: string;
  merchantName: string;
  amount: number;
  currency: string | null;
  transactionDate: Date;
  paymentDate: Date | null;
  paymentIdentifier: string | null;
  billId: number | null;
  billName: string | null;
  businessNumber: string | null;
  note: string | null;
  rawTransactionId?: string;
}

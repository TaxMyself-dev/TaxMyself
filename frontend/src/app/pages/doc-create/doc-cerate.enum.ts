import { CardCompany, UnitOfMeasure, VatType } from "src/app/shared/enums";

export enum DocumentType {
  RECEIPT = 'RECEIPT',
  TAX_INVOICE = 'TAX_INVOICE',
  TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT',
  TRANSACTION_INVOICE = 'TRANSACTION_INVOICE',
  CREDIT_INVOICE = 'CREDIT_INVOICE',
}

export const DocTypeDisplayName = {
  [DocumentType.RECEIPT]: 'קבלה',
  [DocumentType.TAX_INVOICE]: 'חשבונית מס',
  [DocumentType.TAX_INVOICE_RECEIPT]: 'חשבונית מס קבלה',
  [DocumentType.TRANSACTION_INVOICE]: 'חשבון עסקה',
  [DocumentType.CREDIT_INVOICE]: 'חשבונית זיכוי',
};

export const DocTypeDefaultStart: Record<DocumentType, number> = {
  [DocumentType.RECEIPT]: 70001,
  [DocumentType.TAX_INVOICE]: 10001,
  [DocumentType.TAX_INVOICE_RECEIPT]: 50001,
  [DocumentType.TRANSACTION_INVOICE]: 90001,
  [DocumentType.CREDIT_INVOICE]: 80001,
};

export type DocumentTotals = {
  sumBefDisBefVat: number;
  disSum: number;
  sumAftDisBefVat: number;
  vatSum: number;
  sumAftDisWithVat: number;
  sumWithoutVat: number;
};

export const DocumentTotalsLabels: { field: keyof DocumentTotals; label: string }[] = [
  { field: 'sumBefDisBefVat', label: 'סה״כ לפני הנחה ולפני מע״מ' },
  { field: 'disSum', label: 'סה״כ הנחות' },
  { field: 'sumAftDisBefVat', label: 'סה״כ לאחר הנחה לפני מע״מ' },
  { field: 'vatSum', label: 'סה״כ מע״מ' },
  { field: 'sumAftDisWithVat', label: 'סה״כ לתשלום כולל מע״מ' },
];

export enum DocCreateFields {
    
    DOC_TYPE = "docType",
    DOC_NUMBER = "docNumber",
    DOC_DATE = "docDate",
    DOC_DESCRIPTION = "docDescription",
    DOC_VAT_RATE = "docVatRate",

    RECIPIENT_NAME = "recipientName",
    RECIPIENT_ID = "recipientId",
    RECIPIENT_PHONE = "recipientPhone",
    RECIPIENT_EMAIL = "recipientEmail",

    LINE_DESCRIPTION = 'lineDescription',
    LINE_QUANTITY = 'lineQuantity',
    LINE_VAT_TYPE = 'lineVatType',
    LINE_SUM = 'lineSum',
    LINE_DISCOUNT_TYPE = 'lineDiscountType',
    LINE_DISCOUNT = 'lineDiscount',
    LINE_NUMBER = 'lineNumber',

    SUM_BEF_VAT = 'sumBefVat',
    VAT_RATE = 'vatRate',
    VAT_OPTIONS = 'vatOptions',
    PAYMENT_METHOD = 'paymentMethod',

}

export interface LineItem {

  issuerBusinessNumber: string;
  generalDocIndex: string | null;

  description: string;
  unitQuantity: number;
  vatRate: number;
  vatOpts: VatType;
  sum: number;
  discount: number;

  sumBefVatPerUnit : number;
  disBefVatPerLine : number;
  sumAftDisBefVatPerLine : number;
  vatPerLine: number;

  sumBefVat: number;
  disBefVat: number;
  sumWithoutVat: number;
  sumAftDisWithVat: number;

  lineNumber: number;
  docType: DocumentType;
  transType: string; // = 3
  unitType: UnitOfMeasure;
  bankNumber?: string | null;
  branchNumber?: string | null;
  accountNumber?: string | null;
  checkNumber?: string | null;
  paymentCheckDate?: Date | string | null;
  cardCompany?: CardCompany | null;
  card4Number?: string | null;
  creditCardName?: string | null;
  creditTransType?: CreditTransactionType | null;
  creditPayNumber?: string | null;
  manufacturerName?: string | null;
  productSerialNumber?: string | null;
  internalNumber?: string | null;
  journalEntryMainId?: string | null;

  // extra fields not in the entity
  payDate?: Date | string;         // ← UI only
  tempId?: string;                 // ← UI-only identifier
  docNumber?: string;              // ← e.g. frontend display
}

export type PartialLineItem = Partial<LineItem>;

// Define the enum for banks
export enum BankName {
  HAPOALIM = 'HAPOALIM',
  LEUMI = 'LEUMI',
  MIZRAHI_TEFAHOT = 'MIZRAHI_TEFAHOT',
  DISCONT = 'DISCONT',
  MERCANTILE = 'MERCANTILE',
  BEN_LEUMI = 'BEN_LEUMI',
  OTSAR_HACHAYAL = 'OTSAR_HACHAYAL',
}


export type BankNameHebrew = 'הפועלים' | 'לאומי' | 'מזרחי טפחות' | 'דיסקונט' | 'מרכנתיל' | 'בינלאומי' | 'אוצר החייל';

export const bankOptionsList = [
  { value: 12, name: 'הפועלים' },
  { value: 10, name: 'לאומי' },
  { value: 20, name: 'מזרחי טפחות' },
  { value: 11, name: 'דיסקונט' },
  { value: 17, name: 'מרכנתיל' },
  { value: 31, name: 'בינלאומי' },
  { value: 14, name: 'אוצר החייל' },
] satisfies Array<{ value: number; name: BankNameHebrew }>;

// Map each bank enum to its Hebrew label
export const BankNameLabels = {
  [BankName.HAPOALIM]: 'הפועלים',
  [BankName.LEUMI]: 'לאומי',
  [BankName.MIZRAHI_TEFAHOT]: 'מזרחי טפחות',
  [BankName.DISCONT]: 'דיסקונט',
  [BankName.MERCANTILE]: 'מרכנתיל',
  [BankName.BEN_LEUMI]: 'בינלאומי',
  [BankName.OTSAR_HACHAYAL]: 'אוצר החייל',
};

export type CreditTransactionType = 'REGULAR' | 'INSTALLMENTS' | 'CREDIT' | 'DEFERRED_CHARGE' | 'OTHER';


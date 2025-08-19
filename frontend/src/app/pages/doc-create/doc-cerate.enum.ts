import { CardCompany, CreditTransactionType, PaymentMethodType, UnitOfMeasure, VatOptions } from "src/app/shared/enums";

export enum DocumentType {
  RECEIPT = 'RECEIPT',
  TAX_INVOICE = 'TAX_INVOICE',
  TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT',
  TRANSACTION_INVOICE = 'TRANSACTION_INVOICE',
  CREDIT_INVOICE = 'CREDIT_INVOICE',
}

export const DocTypeDefaultStart: Record<DocumentType, number> = {
  [DocumentType.RECEIPT]: 70001,
  [DocumentType.TAX_INVOICE]: 10001,
  [DocumentType.TAX_INVOICE_RECEIPT]: 50001,
  [DocumentType.TRANSACTION_INVOICE]: 90001,
  [DocumentType.CREDIT_INVOICE]: 80001,
};

export const DocTypeDisplayName: Record<DocumentType, string> = {
  [DocumentType.RECEIPT]: 'קבלה',
  [DocumentType.TAX_INVOICE]: 'חשבונית מס',
  [DocumentType.TAX_INVOICE_RECEIPT]: 'חשבונית מס קבלה',
  [DocumentType.TRANSACTION_INVOICE]: 'חשבונית עסקה',
  [DocumentType.CREDIT_INVOICE]: 'חשבונית זיכוי',
};

export enum DocumentTotalsField {
  TOTAL_BEFORE_VAT = 'totalBeforeVat',
  TOTAL_VAT = 'totalVat',
  TOTAL_WITHOUT_VAT = 'totalWithoutVat',
  TOTAL_AFTER_VAT = 'totalAfterVat',
}

// Define labels in the exact order you want to display
export const DocumentTotalsLabels: { field: DocumentTotalsField; label: string }[] = [
  { field: DocumentTotalsField.TOTAL_BEFORE_VAT, label: 'סכום לפני מע״מ' },
  { field: DocumentTotalsField.TOTAL_VAT, label: 'סכום מע״מ' },
  { field: DocumentTotalsField.TOTAL_WITHOUT_VAT, label: 'סכום ללא מע״מ' },
  { field: DocumentTotalsField.TOTAL_AFTER_VAT, label: 'סה״כ לתשלום (כולל מע״מ)' },
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

  issuerbusinessNumber: string;
  generalDocIndex: string | null;

  description: string;
  unitQuantity: number;
  vatRate: number;
  vatOpts: VatOptions;
  sum: number;
  discount: number;

  sumBefVatPerUnit : number;
  disBefVatPerLine : number;
  sumAftDisBefVatPerLine : number;
  vatPerLine: number;

  sumBefVat: number;
  disBefVat: number;
  sumWithoutVat: number;
  // vat: number;
  sumAftDisWithVat: number;

  // paymentMethod: PaymentMethodType;
  lineNumber: number;
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
  DISCOUNT = 'DISCOUNT',
  IGUD = 'IGUD',
  MERCANTILE = 'MERCANTILE',
}

// Map each bank enum to its Hebrew label
export const BankNameLabels = {
  [BankName.HAPOALIM]: 'הפועלים',
  [BankName.LEUMI]: 'לאומי',
  [BankName.MIZRAHI_TEFAHOT]: 'מזרחי טפחות',
  [BankName.DISCOUNT]: 'דיסקונט',
  [BankName.IGUD]: 'איגוד',
  [BankName.MERCANTILE]: 'מרכנתיל',
};

// Create the list for dropdowns (PrimeNG p-dropdown expects {value, label/name})
export const bankOptionsList = [
  { value: BankName.HAPOALIM, name: BankNameLabels[BankName.HAPOALIM] },
  { value: BankName.LEUMI, name: BankNameLabels[BankName.LEUMI] },
  { value: BankName.MIZRAHI_TEFAHOT, name: BankNameLabels[BankName.MIZRAHI_TEFAHOT] },
  { value: BankName.DISCOUNT, name: BankNameLabels[BankName.DISCOUNT] },
  { value: BankName.IGUD, name: BankNameLabels[BankName.IGUD] },
  { value: BankName.MERCANTILE, name: BankNameLabels[BankName.MERCANTILE] },
];


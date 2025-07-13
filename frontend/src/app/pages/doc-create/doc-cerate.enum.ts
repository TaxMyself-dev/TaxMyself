import { CardCompany, CreditTransactionType, PaymentMethodType, UnitOfMeasure, VatOptions } from "src/app/shared/enums";

export enum DocCreateFields {
    
    DOC_TYPE = "docType",
    DOC_NUMBER = "docNumber",
    DOC_DATE = "docDate",
    DOC_DESCRIPTION = "docDescription",
    DOC_VAT_RATE = "docVatRate",

    CUSTOMER_NAME = "customerName",
    CUSTOMER_ID = "customerId",
    CUSTOMER_PHONE = "customerPhone",
    CUSTOMER_EMAIL = "customerEmail",

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

export interface LineItems {

    issuerbusinessNumber: string;
    generalDocIndex: string | null;

    description: string;
    unitAmount: number;
    vatOpts: VatOptions;
    sum: number;
    discount: number;


  sumBefVat: number;
  disBefVat: number;
  sumAftDisWithVat: number;
  vatRate: number;
  paymentMethod: PaymentMethodType;
  lineNumber: string;
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

// export enum RegisterFormModules {
//     PERSONAL = 'personal',
//     SPOUSE = 'spouse',
//     CHILDREN = 'children',
//     BUSINESS = 'business',
// }
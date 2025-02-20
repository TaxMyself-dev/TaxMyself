export enum UserRole {
  REGULAR = 'REGULAR',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum PayStatus {
  FREE = 'FREE',
  PAID = 'PAID',
  TRIAL = 'TRIAL',
}

export enum BusinessType {
  EXEMPT = 'EXEMPT',
  LICENSED = 'LICENSED',
  COMPANY = 'COMPANY',
}

export enum FamilyStatus {
  MARRIED = 'MARRIED',
  SINGLE = 'SINGLE',
  DIVORCED = 'DIVORCED'
}

export enum EmploymentType {
  SELF_EMPLOYED = 'SELF_EMPLOYED',
  BOTH = 'BOTH',
  EMPLOYEE = 'EMPLOYEE'
}

export enum VATReportingType {
  NOT_REQUIRED = 'NOT_REQUIRED',
  SINGLE_MONTH_REPORT = 'SINGLE_MONTH_REPORT',
  DUAL_MONTH_REPORT = 'DUAL_MONTH_REPORT'
}

export enum TaxReportingType {
  NOT_REQUIRED = 'NOT_REQUIRED',
  SINGLE_MONTH_REPORT = 'SINGLE_MONTH_REPORT',
  DUAL_MONTH_REPORT = 'DUAL_MONTH_REPORT'
}

// Enum for single month report
export enum SingleMonthReport {
  JANUARY = "1/2024",
  FEBRUARY = "2/2024",
  MARCH = "3/2024",
  APRIL = "4/2024",
  MAY = "5/2024",
  JUNE = "6/2024",
  JULY = "7/2024",
  AUGUST = "8/2024",
  SEPTEMBER = "9/2024",
  OCTOBER = "10/2024",
  NOVEMBER = "11/2024",
  DECEMBER = "12/2024"
}

// Enum for dual month report
export enum DualMonthReport {
  JAN_FEB = "1-2/2024",
  MAR_APR = "3-4/2024",
  MAY_JUN = "5-6/2024",
  JUL_AUG = "7-8/2024",
  SEP_OCT = "9-10/2024",
  NOV_DEC = "11-12/2024"
}

// Enum for dual month report
export enum SourceType {
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT'
}

export enum DocumentType {
  GENERAL = 'GENERAL', // כללי
  RECEIPT = 'RECEIPT', // קבלה
  TAX_INVOICE = 'TAX_INVOICE', // חשבונית מס
  TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT', // חשבונית מס קבלה
  TRANSACTION_INVOICE = 'TRANSACTION_INVOICE', // חשבונית עסקה
  CREDIT_INVOICE = 'CREDIT_INVOICE', // חשבונית זיכוי
}

export const DocumentTypeCodeMap: Partial<Record<DocumentType, number>> = {
  [DocumentType.TRANSACTION_INVOICE]: 300,
  [DocumentType.TAX_INVOICE]: 305,
  [DocumentType.TAX_INVOICE_RECEIPT]: 320,
  [DocumentType.CREDIT_INVOICE]: 330,
  [DocumentType.RECEIPT]: 400,
};

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  BIT = 'BIT',
  PAYBOX = 'PAYBOX',
  CREDIT_CARD = 'CREDIT_CARD',
  CHECK = 'CHECK',
}
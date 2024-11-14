export enum UserRole {
  FREE_USER = 'FREE_USER',
  PAID_USER = 'PAID_USER',
  ADMIN = 'ADMIN'
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
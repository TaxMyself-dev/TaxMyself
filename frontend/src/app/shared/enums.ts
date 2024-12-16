export enum paymentIdentifierType {
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT'
}
export enum FormTypes {
  CHECKBOX = 'checkbox',
  TEXT = 'text',
  DDL = 'ddl',
  FILE = 'file',
  DATE = 'date',
  NUMBER = 'number',
  EMAIL = 'email',
  PASSWORD = 'password',
  TELEPHONE = 'tel'
}

export enum displayColumnsExpense {
  supplier = 'ספק',
  date = 'תאריך',
  sum = 'סכום',
  categoryName = 'קטגוריה',
  subCategoryName = 'תת-קטגוריה',
  vatPercent = 'מוכר למעמ',
  taxPercent = 'מוכר למס',
  month = 'דווח לחודש',
  isEquipment = 'מוגדר כציוד',
  isRecognized = 'הוצאה מוכרת',
  reductionPercent = 'אחוז פחת'
}

export enum ExpenseFormHebrewColumns {
  date = 'תאריך',
  sum = 'סכום',
  supplier = 'ספק',
  category = 'קטגוריה',
  subCategory = 'תת קטגוריה',
  expenseNumber = 'מספר חשבונית',
  vatPercent = 'מוכר למעמ(%)',
  taxPercent = 'מוכר למס(%)',
  supplierID = 'ח.פ. ספק',
  file = 'קובץ',
  note = 'הערה / פירוט',
  totalVatPayable = 'מוכר למעמ(₪)',
  totalTaxPayable = 'מוכר למס(₪)',
  isEquipment = 'האם ההוצאה הינה עבור רכוש קבוע?',
  loadingDate = 'תאריך העלאת קובץ',
  reductionPercent = 'פחת',
  checkbox = 'בחר',
  actions = 'פעולות',
  businessNumber = 'שייך לעסק'

}

export enum ExpenseFormColumns {
  BUSINESS_NUMBER = 'businessNumber',
  SUPPLIER = 'supplier',
  DATE = 'date',
  SUM = 'sum',
  CATEGORY = 'category',
  SUB_CATEGORY = 'subCategory',
  EXPENSE_NUMBER = 'expenseNumber',
  VAT_PERCENT = 'vatPercent',
  TAX_PERCENT = 'taxPercent',
  SUPPLIER_ID = 'supplierID',
  FILE = 'file',
  NOTE = 'note',
  TOTAL_TAX = 'totalTaxPayable',
  TOTAL_VAT = 'totalVatPayable',
  IS_EQUIPMENT = 'isEquipment',
  REDUCTION_PERCENT = 'reductionPercent',
  LOADING_DATE = 'loadingDate',
  ACTIONS = 'actions',
  CHECKBOX = 'checkbox'
}

export enum TransactionsOutcomesColumns {
  BUSINESS_NAME = 'businessName',
  BUSINESS_NUMBER = 'businessNumber',
  TAX_PERCENT = 'taxPercent',
  VAT_PERCENT = 'vatPercent',
  TOTAL_TAX = 'totalTaxPayable',
  TOTAL_VAT = 'totalVatPayable',
  ID = 'id',
  REDUCTION_PERCENT = 'reductionPercent',
  BILL_NUMBER = 'paymentIdentifier',
  PAY_DATE = 'payDate',
  BILL_DATE = 'billDate',
  BILL_NAME = 'billName',
  IS_RECOGNIZED = 'isRecognized',
  IS_EQUIPMENT = 'isEquipment',
  NAME = 'name',
  SUM = 'sum',
  CATEGORY = 'category',
  SUBCATEGORY = 'subCategory',
  MONTH_REPORT = 'monthReport',
  CHECKBOX = 'checkbox',
  ACTIONS = 'actions',
  NOTE = 'note2'

}

export enum TransactionsOutcomesHebrewColumns {
  id = 'מספר עסקה',
  businessNumber = 'שייך לעסק',
  paymentIdentifier = 'אמצעי תשלום',
  payDate = 'תאריך החיוב',
  billDate = 'תאריך עסקה',
  name = 'שם העסק',
  sum = 'סכום',
  category = 'קטגוריה',
  subCategory = 'תת-קטגוריה',
  monthReport = 'דווח לחודש',
  billName = 'חשבון',
  isRecognized = 'הוצאה מוכרת',
  isEquipment = 'מוכר כציוד',
  reductionPercent = 'אחוז פחת',
  totalTax = 'מוכר למס',
  totalVat = 'מוכר למע"מ',
  checkbox = 'בחר',
  actions = 'פעולות',
  businessName = 'שייך לעסק',
  note = 'הערה'
}

export const months = [
  { value: 0, name: 'ינואר - פברואר' },
  { value: 2, name: 'מרץ - אפריל' },
  { value: 4, name: 'מאי - יוני' },
  { value: 6, name: 'יולי - אוגוסט' },
  { value: 8, name: 'ספטמבר - אוקטובר' },
  { value: 10, name: 'נובמבר - דצמבר' }
];

export const singleMonths = [
  { value: 0, name: 'ינואר' },
  { value: 1, name: 'פברואר' },
  { value: 2, name: 'מרץ' },
  { value: 3, name: 'אפריל' },
  { value: 4, name: 'מאי' },
  { value: 5, name: 'יוני' },
  { value: 6, name: 'יולי' },
  { value: 7, name: 'אוגוסט' },
  { value: 8, name: 'ספטמבר' },
  { value: 9, name: 'אוקטובר' },
  { value: 10, name: 'נובמבר' },
  { value: 11, name: 'דצמבר' }
];

export enum ICellRenderer {
  CATEGORY = 'category',
  SUBCATEGORY = 'subCategory',
  BILL = 'billName',
  CHECKBOX = 'checkbox',
  DATE = 'date'
}

export enum NavigationItemClass {
  CIRCLE = 'circle'
}

export enum FamilyStatus {
  MARRIED = 'MARRIED',
  SINGLE = 'SINGLE',
  DIVORCED = 'DIVORCED'
}

export const FamilyStatusLabels = {
  [FamilyStatus.MARRIED]: 'נשוי/אה',
  [FamilyStatus.SINGLE]: 'רווק/ה',
  [FamilyStatus.DIVORCED]: 'גרוש/ה'
};

export const familyStatusOptionsList = [
  { value: FamilyStatus.SINGLE, name: FamilyStatusLabels[FamilyStatus.SINGLE] },
  { value: FamilyStatus.MARRIED, name: FamilyStatusLabels[FamilyStatus.MARRIED] },
  { value: FamilyStatus.DIVORCED, name: FamilyStatusLabels[FamilyStatus.DIVORCED] }
];

export enum BusinessType {
  EXEMPT = 'EXEMPT',
  LICENSED = 'LICENSED',
  COMPANY = 'COMPANY'
}

export const BusinessTypeLabels = {
  [BusinessType.EXEMPT]: 'עוסק פטור',
  [BusinessType.LICENSED]: 'עוסק מורשה',
  [BusinessType.COMPANY]: 'חברה בע"מ'
};

export const businessTypeOptionsList = [
  { value: BusinessType.EXEMPT, name: BusinessTypeLabels[BusinessType.EXEMPT] },
  { value: BusinessType.LICENSED, name: BusinessTypeLabels[BusinessType.LICENSED] },
  { value: BusinessType.COMPANY, name: BusinessTypeLabels[BusinessType.COMPANY] }
];

export enum EmploymentType {
  SELF_EMPLOYED = 'SELF_EMPLOYED',
  BOTH = 'BOTH',
  EMPLOYEE = 'EMPLOYEE'
}

export const EmploymentTypeLabels = {
  [EmploymentType.SELF_EMPLOYED]: 'עצמאי/ת',
  [EmploymentType.BOTH]: 'עצמאי/ת + שכיר/ה',
  [EmploymentType.EMPLOYEE]: 'שכיר/ה'
};

export const employmentTypeOptionsList = [
  { value: EmploymentType.SELF_EMPLOYED, name: EmploymentTypeLabels[EmploymentType.SELF_EMPLOYED] },
  { value: EmploymentType.BOTH, name: EmploymentTypeLabels[EmploymentType.BOTH] },
  { value: EmploymentType.EMPLOYEE, name: EmploymentTypeLabels[EmploymentType.EMPLOYEE] }
];

export enum ReportingPeriodType {
  MONTHLY = 'MONTHLY',
  BIMONTHLY = 'BIMONTHLY',
  ANNUAL = 'ANNUAL',
  DATE_RANGE = 'DATE_RANGE'
}

export const ReportingPeriodTypeLabels = {
  [ReportingPeriodType.MONTHLY]: 'חודשי',
  [ReportingPeriodType.BIMONTHLY]: 'דו-חודשי',
  [ReportingPeriodType.ANNUAL]: 'שנתי',
  [ReportingPeriodType.DATE_RANGE]: 'טווח תאריכים'
};

export const reportingPeriodTypeOptionsList = [
  { value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] },
  { value: ReportingPeriodType.ANNUAL, name: ReportingPeriodTypeLabels[ReportingPeriodType.ANNUAL] },
  { value: ReportingPeriodType.DATE_RANGE, name: ReportingPeriodTypeLabels[ReportingPeriodType.DATE_RANGE] }
];
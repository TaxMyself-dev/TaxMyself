import { ISelectItem } from "./interface";

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
  isEquipment = 'רכוש קבוע',
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
  MONTH_REPORT = 'vatReportingDate',
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
  note = 'הערה',
  documentDate = 'תאריך המסמך',
  currency = 'סוג מטבע',
}

export enum UniformFileDocumentSummaryColumns {
  DOC_NUMBER = 'docNumber',
  DOC_DESCRIPTION = 'docDescription',
  TOTAL_DOCS = 'totalDocs',
  TOTAL_SUM = 'totalSum',
}

export enum UniformFileDocumentSummaryHebrewColumns {
  docNumber = 'מספר מסמך',
  docDescription = 'סוג מסמך',
  totalDocs = 'סה"כ כמותי',
  totalSum = 'סה"כ כספי',
}

export enum UniformFileListSummaryColumns {
  LIST_NUMBER = 'listNumber',
  LIST_DESCRIPION = 'listDescription',
  LIST_TOTAL = 'listTotal',
}

export enum UniformFileListSummaryHebrewColumns {
  listNumber = 'קוד רשומה',
  listDescription = 'תיאור רשומה',
  listTotal = 'סך רשומות',
}

export enum Currency {
  ILS = 'ILS',
  USD = 'USD',
  EUR = 'EUR',
}

export enum CurrencyHebrew {
  ILS = 'שקל',
  USD = 'דולר',
  EUR = 'יורו',
}

export enum FieldsCreateDocValue {
  DOC_TYPE = 'docType',
  DOC_DESCRIPTION = 'docDescription',
  DOCUMENT_DATE = 'documentDate',
  DOC_VAT_RATE = 'docVatRate',
  VAT_SUM = 'vatSum',
  CURRENCY = "currency",
  RECIPIENT_NAME = 'recipientName',
  RECIPIENT_ID = 'recipientId',
  RECIPIENT_PHONE = 'recipientPhone',
  RECIPIENT_EMAIL = 'recipientEmail',
  RECIPIENT_CITY = 'recipientCity',
  RECIPIENT_STREET = 'recipientStreet',
  RECIPIENT_HOME_NUMBER = 'recipientHomeNumber',
  RECIPIENT_POSTAL_CODE = 'recipientPostalCode',
  RECIPIENT_STATE = 'recipientState',
  RECIPIENT_STATE_CODE = 'recipientStateCode',
  SUM_AFTER_DIS_BEF_VAT = 'sumAfterDisBefVat',
  SUM_AFTER_DIS_WITH_VAT = 'sumAfterDisWithVat',
  SUM_BEF_DIS_BEF_VAT = 'sumBefDisBefVat',
  LINE_DESCRIPTION = 'description',
  SUM = 'sum',
  VAT_OPTIONS = 'vatOptions',
  DISCOUNT = 'discount',
  UNIT_AMOUNT = 'unitAmount',
}

export enum FieldsCreateDocName {
  //typeFile = "באיזה מסמך אתה מעוניין?",
  currency = "מטבע",
  docVatRate = "שיעור מעמ",
  date = "תאריך ביצוע התשלום",
  documentDate = "תאריך המסמך",
  recipientName = "שם הלקוח",
  recipientId = "ת.ז. / ח.פ. של הלקוח",
  recipientEmail = "אימייל של הלקוח",
  recipientCity = "עיר",
  recipientStreet = "רחוב",
  recipientHomeNumber = "מס' בית",
  recipientPostalCode = "מיקוד",
  recipientState = "מדינה",
  recipientStateCode = "קוד מדינה",
  recipientPhone = "מס' טלפון של הלקוח",
  docDescription = "תשלום עבור",
  vatSum = 'סכום מע"מ',
  sumAfterDisBefVat = 'סכום לאחר הנחה לפני מע"מ',
  sumAfterDisWithVat = 'סכום לאחר הנחה כולל מע"מ',
  sumBefDisBefVat = 'סכום לפני הנחה ולפני מע"מ',
}

export enum fieldLineDocValue {
  SUM = 'sum',
  LINE_DESCRIPTION = 'description',
  UNIT_AMOUNT = 'unitAmount',
  SUM_BEF_VAT = 'sumBefVat',
  VAT_RATE = 'vatRate',
  VAT_OPTIONS = 'vatOptions',
  PAYMENT_METHOD = 'paymentMethod',
  DISCOUNT = 'discount',
  LINE_NUMBER = 'lineNumber',
  UNIT_TYPE = 'unitType',
  BANK_NUMBER = 'bankNumber',
  BRANCH_NUMBER = 'branchNumber',
  ACCOUNT_NUMBER = 'accountNumber',
  CHECK_NUMBER = 'checkNumber',
  PAYMENT_CHECK_DATE = 'paymentCheckDate',
  CARD_COMPANY = 'cardCompany',
  CARD_4_NUMBER = 'card4Number',
  CREDIT_CARD_NAME = 'creditCardName',
  CREDIT_TRANS_TYPE = 'creditTransType',
  CREDIT_PAY_NUMBER = 'creditPayNumber',
  MANUFACTURER_NAME = 'manufacturerName',
  PRODUCT_SERIAL_NUMBER = 'productSerialNumber',
  INTERNAL_NUMBER = 'internalNumber',
  JOURNAL_ENTRY_MAIN_ID = 'journalEntryMainId',
}

export enum fieldLineDocName {
  sum = 'סכום',
  line_description = 'תיאור',
  unitAmount = 'מחיר ליחידה',
  sumBefVat = 'סכום לפני מע"מ',
  vatRate = 'שיעור מע"מ',
  vatOptions = 'מע"מ',
  paymentMethod = 'אמצעי תשלום',
  discount = 'הנחה',
  lineNumber = 'מספר שורה',
  unitType = 'יחידת מידה',
  bankNumber = 'מספר הבנק',
  branchNumber = 'מספר הסניף',
  accountNumber = 'מספר חשבון',
  checkNumber = 'מספר המחאה',
  paymentCheckDate = 'תאריך הפירעון של הצ"ק',
  cardCompany = 'חברת האשראי',
  card4Number = 'ארבע ספרות אחרונות של הכרטיס',
  creditCardName = 'שם הכרטיס הסולק',
  creditTransType = 'סוג עסקת האשראי',
  creditPayNumber = 'מספר תשלום',
  manufacturerName = 'שם היצרן',
  productSerialNumber = 'מספר סידורי של המוצר',
  internalNumber = 'מספר פנימי',
  journalEntryMainId = 'מספר ראשי של רשומת יומן',
}

export type CreateDocFields = fieldLineDocValue | FieldsCreateDocValue;

export enum PaymentMethodValue {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  BIT = 'BIT',
  PAYBOX = 'PAYBOX',
  CREDIT_CARD = 'CREDIT_CARD',
  CHECK = 'CHECK',
}

export enum PaymentMethodName {
  CASH = 'מזומן',
  BANK_TRANSFER = 'העברה בנקאית',
  BIT = 'ביט',
  PAYBOX = 'פייבוקס',
  CREDIT_CARD = 'כרטיס אשראי',
  CHECK = "צ'ק",
}

// export enum VatOptions {
//   INCLUDE = 'INCLUDE',
//   EXCLUDE = 'EXCLUDE',
//   WITHOUT = 'WITHOUT',
// }

export type VatType = 'INCLUDE' | 'EXCLUDE' | 'WITHOUT';

export const vatOptions: Array<{ value: VatType; name: string }> = [
  { value: 'INCLUDE', name: 'כולל מע״מ' },
  { value: 'EXCLUDE', name: 'לא כולל מע״מ' },
  { value: 'WITHOUT', name: 'ללא מע״מ' },
];


export enum UnitOfMeasure {
  UNIT = 'UNIT',
  WORK_HOUR = 'WORK_HOUR',
  LITER = 'LITER',
  KILOGRAM = 'KILOGRAM'
}

export enum CreditTransactionType {
  REGULAR = 'REGULAR',   // רגיל
  INSTALLMENTS = 'INSTALLMENTS', // תשלומים
  CREDIT = 'CREDIT', // קרדיט
  DEFERRED_CHARGE = 'DEFERRED_CHARGE', // חיוב נדחה
  OTHER = 'OTHER' // אחר
}

// export type VatOptions = 'WITHOUT' | 'BEFORE' | 'AFTER'

export type PaymentMethodType = 'CASH' | 'BANK_TRANSFER' | 'BIT' | 'PAYBOX' | 'CREDIT_CARD' | 'CHECK';

export enum CardCompany {
  ISRACARD = 'ISRACARD',
  CAL = 'CAL',
  DINERS = 'DINERS',
  AMERICAN_EXPRESS = 'AMERICAN_EXPRESS',
  VISA = 'VISA',
  LEUMI_CARD = 'LEUMI_CARD',
  MASTERCARD = 'MASTERCARD',
  OTHER = 'OTHER'
}

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

export const doubleMonthsList: ISelectItem[] = [
  { value: '1', name: 'ינואר - פברואר' },
  { value: '3', name: 'מרץ - אפריל' },
  { value: '5', name: 'מאי - יוני' },
  { value: '7', name: 'יולי - אוגוסט' },
  { value: '9', name: 'ספטמבר - אוקטובר' },
  { value: '11', name: 'נובמבר - דצמבר' }
];

export const singleMonthsList: ISelectItem[] = [
  { value: '1', name: 'ינואר' },
  { value: '2', name: 'פברואר' },
  { value: '3', name: 'מרץ' },
  { value: '4', name: 'אפריל' },
  { value: '5', name: 'מאי' },
  { value: '6', name: 'יוני' },
  { value: '7', name: 'יולי' },
  { value: '8', name: 'אוגוסט' },
  { value: '9', name: 'ספטמבר' },
  { value: '10', name: 'אוקטובר' },
  { value: '11', name: 'נובמבר' },
  { value: '12', name: 'דצמבר' }
];

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

export const reportingVatPeriodTypeOptionsList = [
  { value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] },
];

export const reportingPnlPeriodTypeOptionsList = [
  { value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] },
  { value: ReportingPeriodType.ANNUAL, name: ReportingPeriodTypeLabels[ReportingPeriodType.ANNUAL] },
  { value: ReportingPeriodType.DATE_RANGE, name: ReportingPeriodTypeLabels[ReportingPeriodType.DATE_RANGE] }
];

export enum bunnerImagePosition {
  TOP_LEFT = 'top-left',
  TOP_RIGHT = 'top-right',
  CENTER = 'center',
  CENTER_LEFT = 'left-center',
  CENTER_RGHIT = 'right-center',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_RIGHT = 'bottom-right'
}

export enum inputsSize {
  SMALL = 'narrow',
  BETWEEN = 'between',
  MEDIUM = 'normal',
  LARGE = 'wide',
  AUTO = 'auto'
}

export enum BusinessMode {
  ONE_BUSINESS = 'oneBusiness',
  TWO_BUSINESS = 'twoBusiness',
}
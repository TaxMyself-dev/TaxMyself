import { ValidatorFn } from "@angular/forms";
import { RegisterFormModules } from "../pages/register/regiater.enum";
import { AccountantTaskSource, AccountantTaskType, BusinessStatus, BusinessType, ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer, TaxReportingType, VATReportingType } from "./enums";

/** רשומת משימה של רואה חשבון – החזרה מה-API (כולל שמות לקוח/עסק לתצוגה) */
export interface IAccountantTask {
    id: number;
    accountantFirebaseId: string;
    clientFirebaseId: string;
    businessNumber: string;
    type: AccountantTaskType;
    source: AccountantTaskSource;
    periodStart: string | null;
    periodEnd: string | null;
    title: string;
    description: string | null;
    dueDate: string;
    visibleFrom: string;
    isComplete: boolean;
    completedAt: string | null;
    dismissedAt: string | null;
    createdAt: string;
    updatedAt: string;
    clientName: string;
    businessName: string;
    /** קיים רק כש-type = ANNUAL_REPORT וקיימת רשומת AnnualReport תואמת */
    annualReportId?: number;
    /** סטטוס הדוח השנתי המקושר (אם קיים) */
    annualReportStatus?: string;
    /** קיים רק כש-type ∈ {VAT_REPORT, ADVANCE_TAX} ויש ReportWorkflow תואם */
    workflowId?: number;
    /** סטטוס תהליך הדיווח (ממתין לאישור לקוח / מוכן להכנה / דווח) */
    workflowStatus?: string;
    /** קיים קובץ דוח שמור (PDF) למשימה זו */
    hasReportFile?: boolean;
}

/** תהליך דיווח (מע"מ / מקדמת מס) – הסטטוס המשותף בין הלקוח והרואה חשבון */
export interface IReportWorkflow {
    id: number;
    clientFirebaseId: string;
    businessNumber: string;
    type: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    clientConfirmedAt: string | null;
    clientConfirmedBy: string | null;
    reportedAt: string | null;
    reportedByAccountantFirebaseId: string | null;
    reportedSource: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    /** האם המשתמש הנוכחי (לקוח) רשאי לסמן בעצמו את הדוח כדווח – true כאשר אין לו רואה חשבון פעיל */
    canSelfMark?: boolean;
    /** נתיב קובץ הדוח השמור (PDF) – קיים לאחר שהדוח סומן כהוגש */
    reportFilePath?: string | null;
}

/** Payload להוספת משימה ידנית */
export interface ICreateAccountantTask {
    clientFirebaseId: string;
    businessNumber: string;
    title: string;
    description?: string;
    dueDate?: string;
}

/** Payload לעדכון משימה */
export interface IUpdateAccountantTask {
    title?: string;
    description?: string;
    dueDate?: string;
    isComplete?: boolean;
}

/** קובץ שצורף לדוח שנתי */
export interface IAnnualReportFile {
    id: number;
    annualReportId: number;
    category: string;
    filePath: string;
    fileName: string;
    uploadedByFirebaseId: string;
    uploadedAt: string;
}

/** דוח שנתי – שאלון + מסמכים + סטטוס */
export interface IAnnualReport {
    id: number;
    clientFirebaseId: string;
    businessNumber: string;
    taxYear: number;
    status: string;
    answers: Record<string, unknown> | null;
    requiredCategories: { category: string; minCount: number }[] | null;
    finishedAt: string | null;
    reportedAt: string | null;
    reportedByAccountantFirebaseId: string | null;
    createdAt: string;
    updatedAt: string;
    files: IAnnualReportFile[];
}

export interface ICategory {
    id: number;
    categoryName: string;
    firebaseId: string;
    isExpense: boolean;
}

export interface ISubCategory {
    id: number;
    firebaseId: string;
    businessNumber: string;
    subCategoryName: string;
    categoryName: string;
    taxPercent: number;
    vatPercent: number;
    reductionPercent: number;
    isEquipment: boolean;
    isRecognized: boolean;
    isExpense: boolean;
    necessity: string;
    reportScope?: 'pnl' | 'annual';
    pnlCategory?: string | null;
}

export interface IUserData {
    businessDate: string;
    businessField: string;
    businessInventory: boolean;
    businessName: string;
    businessNumber: string;
    businessType: string;
    businessAddress: string;
    city: string;
    dateOfBirth: string;
    email: string;
    employmentStatus: string;
    fName: string;
    familyStatus: string;
    firebaseId: string;
    id: string;
    index: number;
    businessStatus: BusinessStatus;
    lName: string;
    phone: string;
    role: string;
    spouseBusinessDate: string;
    spouseBusinessField: string;
    spouseBusinessInventory: boolean;
    spouseBusinessName: string;
    spouseBusinessNumber: string;
    spouseBusinessType: string;
    spouseBusinessAddress: string;
    spouseDateOfBirth: string;
    spouseEmploymentStatus: string;
    spouseFName: string;
    spouseId: string;
    spouseLName: string;
    spousePhone: string;
    spouseEmail: string;
    spouseTaxReportingType: string;
    spouseVatReportingType: string;
    taxReportingType: string;
    vatReportingType: string;
    hasOpenBanking: boolean;
    /** Timestamp of the sign-in BEFORE the current session. Null for first-ever login. */
    previousLoginAt: string | null;
    /** Timestamp of the current session's sign-in. */
    lastLoginAt: string | null;
}

export interface IChild {
    index?: number;
    childFName: string;
    childLName: string;
    childID?: string;
    childDate: string;
    parentUserID?: string;
}

export interface IRowDataTable {
    [key: string]: string | number | Date | boolean | ISelectItem | File;
}

export interface IBaseFieldData {
    value: string;
    labelText: string;
    placeHolder: string;
    type: FormTypes;
    enumValues: ISelectItem[] | null;
    validators?: ValidatorFn[];
    initialValue?: any;
    required?: boolean;
}

export interface IPnlReportData {
    income: number | string;
    netProfitBeforeTax: number | string;
    expenses: {
        category: string,
        total: number
    }[];
}

export interface IVatReportData {
    vatableTurnover: string | number;
    nonVatableTurnover: string | number;
    vatRefundOnAssets: string | number;
    vatRefundOnExpenses: string | number;
    vatPayment: string | number;
    vatRate: string | number;
}

export interface IAdvanceIncomeTaxReportData {
    businessType: string;
    vatableTurnover: string | number;
    nonVatableTurnover: string | number;
    vatOnTurnover: string | number;
    totalIncome: string | number;
    advanceTaxPercent: string | number;
    totalAdvanceTax: string | number;
    taxWithholdingAtSource: string | number;
    totalToPay: string | number;
}

export interface IColumnDataTable<TFormColumns, TFormHebrewColumns> {
    name: TFormColumns;
    value: TFormHebrewColumns;
    type?: FormTypes;
    listItems?: ISelectItem[];
    cellRenderer?: ICellRenderer;
    errorText?: string;
    hide?: boolean;
    onChange?: (event?: any, parent?: any) => void;
}

export interface ISettingDoc {
    id: string;
    userId: string;
    documentType: string;
    initialIndex: number | null;
    currentIndex: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDocIndexes {
    docIndex: number;
    generalIndex: number;
    isInitial: boolean;
}

export interface IRegisterLoginImage {
    bg_img: string;
    el_img: string;
    alt: string;
    title: string;
    subTitle: string;
    colorText: string;
    page: RegisterFormModules;
    posText: string;
}

export interface ISupplier extends IRowDataTable {
    id: number,
    name: string,
    category: string,
    supplierID: string,
    subCategory: string,
    taxPercent: string,
    vatPercent: string
}

export interface IChildren {
    fName: string,
    lName: string,
    id: string,
    dateOfBirth: string
};

export interface IItemNavigate {
    name: string,
    image: string,
    index: string,
    link?: string,
    selected?: boolean,
    id?: string,
    disable?: boolean,
    content?: string,
};

export interface IVatReportTableData {
    [key: string]: string | number;
};

export interface ISortDate {
    month?: number[];
    year?: number;
}


export interface IDisplayCategorytDetails {
    categoryName: string;
    isEquipment: string | boolean;
    isRecognized: string | boolean;
}

export interface IGetSubCategory {
    reductionPercent: string;
    subCategoryName: string;
    taxPercent: string;
    vatPercent: string;
    id: number;
    categoryName: {
        firebaesId: string,
        id: number,
        isDefault: boolean,
        categoryName: string
    } | string;
    isEquipment: boolean | string;
    isRecognized: boolean | string;
    isExpense: boolean;
}

export interface IGetSupplier {
    id: number;
    subCategory: string;
    category: string;
    taxPercent: string;
    vatPercent: string;
    supplier: string;
    supplierID: string;
    isEquipment: boolean;
    reductionPercent: number;
}

export interface IMonthData {
    name: string;
    value: number[];
}
export interface User {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    emailVerified: boolean;
}
export interface ICreateSupplier {
    category: string,
    subCategory: string,
    supplier: string,
    taxPercent: string,
    vatPercent: string,
    supplierID: string,
    id: number,
    isEquipment: string,
    reductionPercent: number | string
}

export interface ICheckboxCellData {
    columnName: string,

}

export interface ICityData {
    english_name: string;
    lishka: string;
    name: string;
    semel_lishkat_mana: string;
    semel_moatza_ezorit: string;
    semel_napa: string;
    semel_yeshuv: string;
    shem_moaatza: string;
    shem_napa: string;
}

export interface ITransactionData {
    paymentIdentifier: string,
    subCategory: string,
    isRecognized: boolean | string,
    vatPercent: number,
    taxPercent: number,
    isEquipment: boolean | string,
    reductionPercent: number,
    id: number;
    name: string;
    billDate: number | string;
    payDate: number | string;
    sum: string;
    category: string;
    userId: string;
    billName: string;
    vatReportingDate: string;
    businessNumber: string;
    note: string;
    note2: string;
}

export interface ITableRowAction {
    name: string;
    icon: string;
    fieldName?: string;
    title?: string;
    action: (event?: any, row?: IRowDataTable) => void;
    /** If true, show button even when row has no file (fileActions only) */
    alwaysShow?: boolean;
    /** Per-row predicate — action is shown only when this returns true (or is undefined) */
    showWhen?: (row: IRowDataTable) => boolean;
    /** Optional loading-state getter for the desktop button spinner */
    isLoading?: () => boolean;
}

export interface IMobileCardConfig {
    /** Column name(s) used as the card's primary title (hero section) */
    primaryFields: string[];
    /** Column name whose value is rendered as the highlighted amount/value */
    highlightedField: string;
    /** Column name rendered as the date in the card header */
    dateField: string;
    /** Column names to hide entirely from the card (not rendered anywhere) */
    hiddenFields?: string[];
}

export interface IButtons {
    text: string;
    icon?: string;
    action: (event?: any) => void;
    size: string;
    disabled?: boolean;
}

export interface IClassifyTrans {
    finsiteId: string;
    isSingleUpdate: boolean | number;
    isNewCategory?: boolean; // todo: delete beabause the flow changed
    name: string;
    billName: string;
    category: string;
    subCategory: string;
    isRecognized: boolean | number;
    vatPercent: number;
    taxPercent: number;
    isEquipment: boolean | number;
    reductionPercent: number;
    isExpense: boolean;
    confirmOverride?: boolean;
    businessNumber?: string | null;
    /** Late-arrival reassignment — set when the user picks an alternative
     *  period from the "natural period locked" dialog. */
    targetPeriodLabel?: string;
}

export interface IClassifyTransMinimal {
    finsiteId: string;
    isSingleUpdate: boolean | number;
    name: string;
    billName: string;
    category: string;
    subCategory: string;
    confirmOverride?: boolean;
    businessNumber?: string | null;
    targetPeriodLabel?: string;
}

export interface ISelectItem {
    value: string | number | boolean | Date;
    name: string | number;
    disable?: boolean
}

export interface IToastData {
    message: string;
    color?: string;
    position?: 'top' | 'middle' | 'bottom';
    duration: number;
    type: 'success' | 'error'; // Added type for toast
}

export interface ITotals {
    sumBefDisBefVat: number,
    sumAftDisBefVAT: number,
    vatSum: number,
    sumAftDisWithVAT: number,
};

export interface ICreateDataDoc {
    fid: string;
    digitallySign?: boolean;
    prefill_data: {
        [key: string]: number | string | boolean | (string | number)[][],
        table?: (string | number)[][];
    },
}

export interface IDataDocFormat {
    fileData: {
        [key: string]: number | string | boolean; // Global fields
    };
    docData: {
        [key: string]: number | string | boolean; // Global fields
    };
    linesData: ICreateLineDoc[];
}

export interface ICreateDoc {
    issuerbusinessNumber: string;
    recipientName: string;
    recipientId: string;
    recipientStreet: string;
    recipientHomeNumber: string;
    recipientCity: string;
    recipientPostalCode: string;
    recipientState: string;
    recipientStateCode: string;
    recipientPhone: string;
    recipientEmail: string;
    docType: string;
    generalDocIndex: string;
    docDescription: string;
    docNumber: string;
    docVatRate: number;
    transType: string;
    accountForeing: number;
    currency: string;
    sumBefDisBefVat: number;
    disSum: number;
    sumAftDisBefVAT: number;
    vatSum: number;
    sumAftDisWithVAT: number;
    withholdingTaxAmount: number;
    docDate: Date;
    issueDate: Date;
    issueHour: string;
    customerKey: string;
    matchField: string;
    isCancelled: boolean;
    branchCode: string;
    operationPerformer: string;
    parentDocType: string;
    parentDocNumber: string;
    parentBranchCode: string;
}

export interface ICreateLineDoc {
    issuerbusinessNumber: string;
    generalDocIndex: string;
    description: string;
    unitAmount: number;
    sumBefVat: number;
    sumAftDisWithVat: number;
    vatOptions: string;
    vatRate: number;
    paymentMethod: string;
    disBefVat: number;
    lineNumber: string;
    unitType: string;
    payDate: Date;
    bankNumber: string;
    branchNumber: string;
    accountNumber: string;
    checkNumber: string;
    paymentCheckDate: Date;
    cardCompany: string;
    card4Number: string;
    creditCardName: string;
    creditTransType: string;
    creditPayNumber: string;
    manufacturerName: string;
    productSerialNumber: string;
    internalNumber: string;
    journalEntryMainId: string;
}


export interface ICreateDocField<TFieldsHebrew, TFields> {
    name: TFieldsHebrew;
    value: TFields;
    type: FormTypes;
    listItems?: ISelectItem[];
    errorText?: string;
    expandable?: boolean;
    onChange?: (event?: any, parent?: any) => void;
}

export interface BusinessInfo {
    name: string;
    value: string; //business number
    address: string;
    type: string;
    phone: string;
    email: string
}

export interface Business {
    id?: number;
    firebaseId: string;
    businessName: string | null;
    businessField: string | null;
    businessNumber: string | null;
    businessAddress: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    businessType: BusinessType | null;
    businessInventory: boolean | null;
    businessDate: string | null;
    vatReportingType: VATReportingType | null;
    taxReportingType: TaxReportingType | null;
    nationalInsRequired: boolean | null;
    /** אחוז מקדמות מס הכנסה (משתנה בין עסק לעסק) */
    advanceTaxPercent: number | null;
    //   bankBeneficiary: string | null;
    //   bankName: string | null;
    //   bankBranch: string | null;
    //   bankAccount: string | null;
    //   bankIban: string | null;
}

/**
 * SHAAM Invoice Approval Request Interface
 */
export interface IShaamApprovalRequest {
  user_id: number;
  accounting_software_number: number;
  amount_before_discount: number;
  customer_vat_number: number;
  discount: number;
  invoice_date: string; // YYYY-MM-DD format
  invoice_id: string;
  invoice_issuance_date: string; // YYYY-MM-DD format
  invoice_reference_number: string;
  invoice_type: number;
  payment_amount: number;
  payment_amount_including_vat: number;
  vat_amount: number;
  vat_number: number;
}

/**
 * SHAAM Invoice Approval Response Interface
 */
export interface IShaamApprovalResponse {
  status: number;
  message?: string | null;
  confirmation_number?: string | null; // מספר הקצאה - allocation number
  approved: boolean;
}
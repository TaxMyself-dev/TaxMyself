import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer } from "./enums";

export interface IUserData {
    businessDate: string;
    businessField: string;
    businessInventory: boolean;
    businessName: string;
    businessNumber: string;
    businessType: string;
    city: string;
    dateOfBirth: string;
    email: string;
    employmentStatus: string;
    fName: string;
    familyStatus: string;
    firebaseId: string;
    id: string;
    index: number;
    isTwoBusinessOwner: boolean;
    lName: string;
    phone: string;
    role: string;
    spouseBusinessDate: string;
    spouseBusinessField: string;
    spouseBusinessInventory: boolean;
    spouseBusinessName: string;
    spouseBusinessNumber: string;
    spouseBusinessType: string;
    spouseDateOfBirth: string;
    spouseEmploymentStatus: string;
    spouseFName: string;
    spouseId: string;
    spouseLName: string;
    spousePhone: string;
    spouseTaxReportingType: string;
    spouseVatReportingType: string;
    taxReportingType: string;
    vatReportingType: string;
}

export interface IRowDataTable {
    [key: string]: string | number | Date | boolean | ISelectItem | File;
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

export interface IColumnDataTable<TFormColumns, TFormHebrewColumns> {
    name: TFormColumns;
    value: TFormHebrewColumns;
    type: FormTypes;
    listItems?: ISelectItem[];
    cellRenderer?: ICellRenderer;
    errorText?: string;
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
}  

export interface ISuppliers {
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
    title?: string,
    action: (event?: any, row?: IRowDataTable) => void;
}

export interface IButtons {
    text: string;
    icon?: string;
    action: (event?: any) => void;
    size: string;
    disabled?: boolean;
}

export interface IClassifyTrans {
    id: number;
    isSingleUpdate: boolean | number;
    isNewCategory: boolean;
    name: string;
    billName: string;
    category: string;
    subCategory: string;
    isRecognized: boolean | number;
    vatPercent: number;
    taxPercent: number;
    isEquipment: boolean | number;
    reductionPercent: number;
    isExpense: boolean
}

export interface ISelectItem {
    value: string | number | boolean;
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

export interface ITotals  {
    sumBefDisBefVat: number,
    sumAftDisBefVAT: number,
    vatSum: number,
    sumAftDisWithVAT: number,
  };

  export interface ICreateDataDoc {
    fid: string;
    prefill_data: {
        [key: string]: number | string | boolean | (string | number)[][],
        table?: (string | number)[][];
    },
    // line_data: ICreateLineDoc[],
    digitallySign?: boolean;
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

export interface IFilterItems {
    defaultValue: string;
    name: string;
    value: string;
    fields: ISubFilterList[];
}

export interface ISubFilterList {
    name: string;
    value: string;
    checkbox: boolean;
    checked?: boolean;
    multiple: boolean;
    children?: ISubFilterList[];
}

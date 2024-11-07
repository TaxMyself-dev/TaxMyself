import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer } from "./enums";

export interface IRowDataTable {
    [key: string]: string | number | Date | boolean | ISelectItem;
}

export interface IColumnDataTable<TFormColumns, TFormHebrewColumns> {
    name: TFormColumns;
    value: TFormHebrewColumns;
    type: FormTypes;
    listItems?: ISelectItem[];
    cellRenderer?: ICellRenderer;
    onChange?: (event?: any, parent?: any) => void;
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

export interface IChildren{
    fName: string,
    lName: string,
    id: string,
    dateOfBirth: string
};

export interface IItemNavigate{
    name: string,
    icon: string,
    index: string,
    link?: string,
    selected?: boolean,
    id?: string,
    disable?: boolean
};


export interface IVatReportData {
    equipmentVatRefund: number;
    generalVatRefund: number;
    transactionVAT: number;
    transactionFreeVAT: number;
}

export interface IVatReportTableData {
    [key: string]: string | number;
};

export interface ISortDate{
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
    name: string;
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
 export interface ICreateSupplier{
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
    sum: number;
    category: string;
    userId: string;
    billName: string;
    vatReportingDate: string;
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
}

export interface ISelectItem {
    value: string | number | boolean; 
    name: string | number; 
    disable?: boolean
}
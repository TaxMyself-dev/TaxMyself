import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer } from "./enums";

export interface IRowDataTable {
    [key: string]: string | number | Date | boolean;
}

export interface IColumnDataTable<TFormColumns, TFormHebrewColumns> {
    name: TFormColumns,
    value: TFormHebrewColumns,
    type: FormTypes,
    cellRenderer?: ICellRenderer
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
    link?: string,
    icon: string,
    selected?: boolean,
    id?: string,
    index: string
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



export interface IGetSubCategory {
    id: number;
    subCategory: string;
    category: string;
    taxPercent: string;
    vatPercent: string;
    isEquipment: boolean;
    reductionPercent: string;
}

export interface IGetSupplier {
    id: number;
    subCategory: string;
    category: string;
    taxPercent: string;
    vatPercent: string;
    name: string;
    supplierID: string;
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
    name: string,
    taxPercent: string,
    vatPercent: string,
    supplierID: string,
    id: number,
    isEquipment: string,
    reductionPercent: number
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
    isRecognized: boolean,
    vatPercent: number,
    taxPercent: number,
    isEquipment: boolean,
    reductionPercent: number,
    id: number;
    name: string;
    billDate: Date;
    payDate: Date;
    sum: number;
    category: string;
    userId: string;
}

export interface ITableRowAction {
    name: string;
    icon: string;
    action: (row: IRowDataTable) => void;
}

export interface IButtons {
    text: string;
    icon?: string;
    action: (event?: any) => void;
    size: string;
    disabled?: boolean;
}
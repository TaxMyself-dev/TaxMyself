import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes } from "./enums";

export interface IRowDataTable {
    [key: string]: string | number | Date | boolean;
}

export interface IColumnDataTable {
    name: ExpenseFormColumns,
    value: ExpenseFormHebrewColumns,
    type: FormTypes
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
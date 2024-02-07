    export interface IRowDataTable {
    [key: string]: string | number | Date;
}

export interface IColumnDataTable {
    [key: string]: string;
}
export interface IChildren{
    name: string,
    dateOfBirth: string
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
    id: number
}
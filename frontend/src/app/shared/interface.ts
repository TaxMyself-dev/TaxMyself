export interface IRowDataTable {
    [key: string]: string | number | Date;
    // category : String,
    // provider?: String,
    // sum: number,
    // percentTax: number,
    // percentVat: number,
    // totalTax: number,
    // totalVat?: number,
}

export interface IColumnDataTable {
    [key: string]: string;

    // category: String,
    // provider?: String,
    // sum: string,
    // percentTax: string,
    // percentVat: number,
    // totalTax: number,
    // totalVat?: number,
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
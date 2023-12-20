
/* The service of the table data of the table of receipts
  @columns: titles of table.
  @rows: data of table (one row it is receipt).
   
*/

import { Injectable } from '@angular/core';
import { Observable, of, Subject } from 'rxjs';
import { IColumnDataTable, IRowDataTable } from '../shared/interface';

@Injectable({
  providedIn: 'root'
})
export class TableService {

  private readonly columns = {//mock data 
    provider: 'ספק',
    date: 'תאריך',
    sum: 'סכום',
    category: 'קטגוריה',
    expenseNumber: 'מספר חשבונית',
    percentVat: 'אחוז מוכר למעמ',
    percentTax: 'אחוז מוכר למס',
    idSupply: 'ח.פ. ספק',
    file: 'קובץ',
    note: 'הערה',
    totalTax: 'מוכר למס',
    totalVat: 'מוכר למעמ',
  } as IColumnDataTable;

  private readonly columnsOrder = [
    'provider',
    'date',
    'sum',
    'category',
    'expenseNumber',
    'percentVat',
    'percentTax',
    'idSupply',
    'file',
    'note',
    'totalTax',
    'totalVat'
  ]

  private readonly rows = [//mock data. 
    {
      date: new Date(),
      category: "חשמל",
      sum: 350,
      provider: "חברת חשמל",
      percentTax: 25,
      percentVat: 25,
      totalTax: 87.5,
      totalVat: 0,
    },
    {
      date: new Date(),
      category: "דלק",
      sum: 250,
      provider: "סונול",
      percentTax: 33,
      percentVat: 25,
      totalTax: 0,
      totalVat: 0,
    },
    {
      date: new Date(),
      category: "הדפסות",
      sum: 150,
      provider: "דפוס לוטוס",
      percentTax: 25,
      percentVat: 33,
      totalTax: 0,
      totalVat: 0,
    },
  ] as IRowDataTable[];

  public updateTable$: Subject<boolean> = new Subject();//I need to check what is do

  private _rowDataTable: IRowDataTable[] = this.rows;

  constructor() { };

/* request from server for the data table*/ 
  public getRowData(): Observable<IRowDataTable[]>{
    console.log(this._rowDataTable);
    //this function shoul be calculated in the server
    this._rowDataTable.map((row) => {
      row['totalTax'] = (+row['sum'] * +row['percentTax']) / 100;
      row['totalVat'] = (+row['sum'] * +row['percentVat']) / 100;
    })
    //-------------------------------------------
    return of(this._rowDataTable);
  }
  
  /* request from server for the titles table*/ 
  public getColumns(): Observable<IColumnDataTable> {
    return of(this.columns);
  }

  /* request from server to add a invoice*/ 
  public addRow(data: IRowDataTable): Observable<boolean> {
    this._rowDataTable.push(data);// for mock data Temporary until there are requests to serve.
    console.log( this._rowDataTable);
    

    //return this.http.post<boolean>(url, {data});//whenever it will be server.
    return of(true);
  }
  
  public getColomnsOrder(): string[] {
    return this.columnsOrder;
  }
}

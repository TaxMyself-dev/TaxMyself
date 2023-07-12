
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
export class RowDataTableService {

  private readonly columns = {//mock data 
    date: 'תאריך',
    category: 'קטגוריה',
    provider: 'ספק',
    sum: 'סכום',
    percentTax: 'אחוז מוכר למס',
    percentVat: 'אחוז מוכר למעמ',
    totalTax: 'מוכר למס',
    totalVat: 'מוכר למעמ',
    file: 'קובץ',
  } as IColumnDataTable;
  private readonly rows = [//mock data. 
    {
      date: new Date(),
      category: "חשמל",
      sum: 350,
      provider: "",
      percentTax: 25,
      percentVat: 25,
      totalTax: 0,
      totalVat: 0,
    },
    {
      category: "דלק",
      sum: 250,
      provider: "סונול",
      percentTax: 33,
      percentVat: 25,
      totalTax: 0,
      totalVat: 0,
    },
    {
      category: "הדפסות",
      sum: 150,
      provider: "",
      percentTax: 25,
      percentVat: 33,
      totalTax: 0,
      totalVat: 0,
    },
  ] as IRowDataTable[];

  public updateTable$: Subject<boolean> = new Subject();

  private _rowDataTable: IRowDataTable[] = this.rows;

  constructor() { };

/* request from server for the data table*/ 
  public getRowData(): Observable<IRowDataTable[]>{
    return of(this._rowDataTable);
  }
  
  /* request from server for the titles table*/ 
  public getColumns(): Observable<IColumnDataTable> {
    return of(this.columns);
  }

  /* request from server to add a receipt*/ 
  public addRow(data: IRowDataTable): Observable<boolean> {
    this._rowDataTable.push(data);// for mock data Temporary until there are requests to serve.

    //return this.http.post<boolean>(url, {data});//whenever it will be server.
    return of(true);
  }

  
}

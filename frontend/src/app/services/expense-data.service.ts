import { Injectable } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../shared/interface';
import { Observable, Subject } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ExpenseDataService {
  
  constructor(private http: HttpClient) { }

  private readonly columnsShowExpense = {//mock data 
    supplier: 'ספק',
    date: 'תאריך',
    sum: 'סכום',
    category: 'קטגוריה',
    expenseNumber: 'מספר חשבונית',
    vatPercent: 'אחוז מוכר למעמ',
    taxPercent: 'אחוז מוכר למס',
    supplierID: 'ח.פ. ספק',
    file: 'קובץ',
    note: 'הערה',
    totalTax: 'מוכר למס',
    totalVat: 'מוכר למעמ',
  } as IColumnDataTable;

  private readonly columnsShowExpenseOrder = [
    'supplier',
    'date',
    'sum',
    'category',
    'expenseNumber',
    'vatPercent',
    'taxPercent',
    'supplierID',
    'file',
    'note',
    'totalTax',
    'totalVat'
  ];

  private readonly columnsAddExpense = {//mock data 
    date: 'תאריך',
    category: 'קטגוריה',
    supplier: 'ספק',
    sum: 'סכום',
    taxPercent: 'אחוז מוכר למס',
    vatPercent: 'אחוז מוכר למעמ',
    totalTax: 'מוכר למס',
    totalVat: 'מוכר למעמ',
    file: 'קובץ',
  } as IColumnDataTable;

  public updateTable$: Subject<boolean> = new Subject();//I need to check what is do


  public getColomnsOrder(): string[] {
    return this.columnsShowExpenseOrder;
  }

  public getExpenseByUser(userID?: string): Observable<IRowDataTable[]>{
    const url = "http://localhost:3000/expenses/get_by_userID" ;
    const options = {
      params: new HttpParams().set("userID",userID),
    }
    return this.http.get(url,options) as Observable<IRowDataTable[]>;
  }

  public addExpense(){
    this.http.post
  }

  public getShowExpenseColumns(){
    return this.columnsShowExpense;
  }

  public getAddExpenseColumns(){
    return this.columnsAddExpense;
  }





}

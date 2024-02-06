import { Injectable } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../shared/interface';
import { Observable, Subject } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ExpenseDataService {
  
  constructor(private http: HttpClient) { }

  private readonly columnsAddExpense = {
    supplier: 'ספק',
    date: 'תאריך',
    sum: 'סכום',
    category: 'קטגוריה',
    subCategory: 'תת-קטגוריה',
    expenseNumber: 'מספר חשבונית',
    vatPercent: 'אחוז מוכר למעמ',
    taxPercent: 'אחוז מוכר למס',
    supplierID: 'ח.פ. ספק',
    file: 'קובץ',
    note: 'הערה',
    totalTax: 'מוכר למס',
    totalVat: 'מוכר למעמ',
    isEquipment: 'מוגדר כציוד'
  } as IColumnDataTable;

  private readonly columnsAddExpenseOrder = [
    'supplier',
    'date',
    'sum',
    'category',
    'subCategory',
    'expenseNumber',
    'vatPercent',
    'taxPercent',
    'supplierID',
    'file',
    'note',
    'totalTax',
    'totalVat',
    'isEquipment'
  ];

  // private readonly columnsShowExpense = {//mock data 
  //   date: 'תאריך',
  //   category: 'קטגוריה',
  //   subCategory: 'תת-קטגוריה',
  //   supplier: 'ספק',
  //   sum: 'סכום',
  //   taxPercent: 'אחוז מוכר למס',
  //   vatPercent: 'אחוז מוכר למעמ',
  //   totalTax: 'מוכר למס',
  //   totalVat: 'מוכר למעמ',
  //   file: 'קובץ',
  // } as IColumnDataTable;

  public updateTable$: Subject<boolean> = new Subject();//I need to check what is do


  public getColomnsOrder(): string[] {
    return this.columnsAddExpenseOrder;
  }

  public getExpenseByUser(userID?: string): Observable<IRowDataTable[]>{
    const url = "http://localhost:3000/expenses/get_by_userID" ;
    const options = {
      params: new HttpParams().set("userID",userID),
    }
    return this.http.get<IRowDataTable[]>(url,options);
  }

  public addExpense(){
    this.http.post
  }

  // public getShowExpenseColumns(){
  //   return this.columnsShowExpense;
  // }

  getAddExpenseColumns(){
    return this.columnsAddExpense;
  }





}

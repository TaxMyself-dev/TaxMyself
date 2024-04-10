import { Injectable } from '@angular/core';
import { IColumnDataTable, IGetSupplier, IRowDataTable } from '../shared/interface';
import { Observable, Subject } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes } from '../shared/enums';

@Injectable({
  providedIn: 'root'
})
export class ExpenseDataService {

  constructor(private http: HttpClient) { }

  private readonly columnsAddExpense: IColumnDataTable[] = [
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.EXPENSE_NUMBER, value: ExpenseFormHebrewColumns.expenseNumber, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUPPLIER_ID, value: ExpenseFormHebrewColumns.supplierID, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.IS_EQUIPMENT, value: ExpenseFormHebrewColumns.isEquipment, type: FormTypes.DDL },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.REDUCTION_PERCENT, value: ExpenseFormHebrewColumns.reductionPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.NOTE, value: ExpenseFormHebrewColumns.note, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.FILE, value: ExpenseFormHebrewColumns.file, type: FormTypes.FILE },
    // {name: ExpenseFormColumns.LOADING_DATE, value: ExpenseFormHebrewColumns.loadingDate, type:FormTypes.DATE},
    // {name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type:FormTypes.NUMBER},
    // {name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type:FormTypes.NUMBER}
  ];

  private readonly columnsDisplayExpense: IColumnDataTable[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    // { name: ExpenseFormColumns.EXPENSE_NUMBER, value: ExpenseFormHebrewColumns.expenseNumber, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.TEXT },
    // { name: ExpenseFormColumns.SUPPLIER_ID, value: ExpenseFormHebrewColumns.supplierID, type: FormTypes.TEXT },
    // { name: ExpenseFormColumns.FILE, value: ExpenseFormHebrewColumns.file, type: FormTypes.FILE },
    // { name: ExpenseFormColumns.NOTE, value: ExpenseFormHebrewColumns.note, type: FormTypes.TEXT },
    // { name: ExpenseFormColumns.IS_EQUIPMENT, value: ExpenseFormHebrewColumns.isEquipment, type: FormTypes.DDL },
    // { name: ExpenseFormColumns.LOADING_DATE, value: ExpenseFormHebrewColumns.loadingDate, type: FormTypes.DATE },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type: FormTypes.NUMBER },
    // { name: ExpenseFormColumns.REDUCTION_PERCENT, value: ExpenseFormHebrewColumns.reductionPercent, type: FormTypes.TEXT },
  ];

  public readonly columnsAddExpenseOrder = [
    'date',
    'sum',
    'expenseNumber',
    'supplier',
    'supplierID',
    'isEquipment',
    'category',
    'subCategory',
    'vatPercent',
    'taxPercent',
    'reductionPercent',
    'note',
    'file',
    'totalTax',
    'totalVat',
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
  public isToastOpen$: Subject<boolean> = new Subject();//I need to check what is do


  getColomnsOrder(): string[] {
    return this.columnsAddExpenseOrder;
  }

  getExpenseByUser(userID?: string): Observable<IRowDataTable[]> {
    const url = "http://localhost:3000/expenses/get_by_userID";
    const options = {
      params: new HttpParams().set("userID", userID),
    }
    return this.http.get<IRowDataTable[]>(url, options);
  }

  getShowExpenseColumns(): IColumnDataTable[] {
    return this.columnsDisplayExpense;
  }

  getAddExpenseColumns(): IColumnDataTable[] {
    return this.columnsAddExpense;
  }

  getSubCategory(category: string, isEquipment: boolean): Observable<any> {
    console.log("coldata:", category);
    const url = 'http://localhost:3000/expenses/get-sub-categories-list';
    const params = new HttpParams()
      .set('isEquipment', isEquipment)
      .set('category', category);
    return this.http.get<any>(url, { params: params });
  }

  getcategry(isEquipment: boolean): Observable<any[]> {
    const url = 'http://localhost:3000/expenses/get-categories-list'
    const param = new HttpParams()
      .set('isEquipment', isEquipment);
    return this.http.get<any>(url, { params: param })
  }

  getAllSuppliers(): Observable<IGetSupplier[]> {
    const token = localStorage.getItem('token');
    const url = 'http://localhost:3000/expenses/get-suppliers-list';
    const param = new HttpParams()
      .set('token', token);
    return this.http.get<IGetSupplier[]>(url, { params: param })
  }

  addSupplier(formData: any): Observable<any> {
    const url = "http://localhost:3000/expenses/add-supplier";
    return this.http.post(url, formData);
  }

  editSupplier(formData: any, id: number): Observable<any> {
    const url = "http://localhost:3000/expenses/update-supplier/" + id;
    return this.http.patch(url, formData);
  }

  deleteSupplier(id: number): Observable<any> {
    const token = localStorage.getItem('token');
    const param = new HttpParams()
      .set('token', token);
    const url = "http://localhost:3000/expenses/delete-supplier/" + id;
    return this.http.delete(url, { params: param });
  }

  addExpenseData(data: any): Observable<any> {
    console.log(data);
    return this.http.post('http://localhost:3000/expenses/add-expense', data);
  }

  updateExpenseData(data: any, id: number): Observable<any> {
    return this.http.patch('http://localhost:3000/expenses/update-expense/' + id, data);
  }






}

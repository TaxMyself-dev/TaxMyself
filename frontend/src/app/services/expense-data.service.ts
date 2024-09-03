import { Injectable } from '@angular/core';
import { IColumnDataTable, IGetSupplier, IRowDataTable } from '../shared/interface';
import { Observable, Subject } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes } from '../shared/enums';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExpenseDataService {

  constructor(private http: HttpClient) { }

  private readonly columnsAddExpense: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
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
  ];

  private readonly columnsDisplayExpense: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type: FormTypes.NUMBER },
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

  public updateTable$: Subject<boolean> = new Subject();//I need to check what is do
  public isToastOpen$: Subject<boolean> = new Subject();
  
  token = localStorage.getItem('token');


  getColomnsOrder(): string[] {
    return this.columnsAddExpenseOrder;
  }

  getExpenseByUser(userID?: string): Observable<IRowDataTable[]> {
    //const url = this.baseURL+"/expenses/get_by_userID";
    const url = `${environment.apiUrl}expenses/get_by_userID`;
    const options = {
      params: new HttpParams().set("userID", userID),
    }
    return this.http.get<IRowDataTable[]>(url, options);
  }

  getShowExpenseColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    return this.columnsDisplayExpense;
  }

  getAddExpenseColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    return this.columnsAddExpense;
  }

  getSubCategory(category: string, isEquipment: boolean): Observable<any> {
    const url = `${environment.apiUrl}expenses/get-sub-categories`;
    const headers = {
      'token': this.token
    }
    const params = new HttpParams()
      .set('isEquipment', isEquipment)
      .set('categoryId', category);
    return this.http.get<any>(url, { params: params, headers: headers });
  }

  getcategry(isDefault: boolean): Observable<any[]> {
    const url = `${environment.apiUrl}expenses/get-categories`;
    const headers = {
      'token': this.token
    }
    const param = new HttpParams()
      .set('isDefault', isDefault)
    return this.http.get<any>(url, { params: param, headers: headers })
  }

  getAllSuppliers(): Observable<IGetSupplier[]> {
    //const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/get-suppliers-list`;
    const param = new HttpParams()
      .set('token', this.token);
    return this.http.get<IGetSupplier[]>(url, { params: param })
  }

  addSupplier(formData: any): Observable<any> {
    const url = `${environment.apiUrl}expenses/add-supplier`;
    return this.http.post(url, formData);
  }

  editSupplier(formData: any, id: number): Observable<any> {
    const url = `${environment.apiUrl}expenses/update-supplier/` + id;
    return this.http.patch(url, formData);
  }

  deleteSupplier(id: number): Observable<any> {
    //const token = localStorage.getItem('token');
    const param = new HttpParams()
      .set('token', this.token);
    const url = `${environment.apiUrl}expenses/delete-supplier/` + id;
    return this.http.delete(url, { params: param });
  }

  addExpenseData(data: any): Observable<any> {
    console.log("formdata in send",data);
    return this.http.post(`${environment.apiUrl}expenses/add-expense`, data);
  }

  updateExpenseData(data: any, id: number): Observable<any> {
    console.log("id of update: ", id);
    
    return this.http.patch(`${environment.apiUrl}expenses/update-expense/${id}`, data);
  }






}

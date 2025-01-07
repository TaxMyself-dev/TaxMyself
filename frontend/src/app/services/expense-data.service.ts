import { Injectable } from '@angular/core';
import { IColumnDataTable, IGetSupplier, IRowDataTable } from '../shared/interface';
import { catchError, EMPTY, from, Observable, Subject, switchMap } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer } from '../shared/enums';
import { environment } from 'src/environments/environment';
import { LoadingController, ModalController } from '@ionic/angular';
import { ModalExpensesComponent } from '../shared/modal-add-expenses/modal.component';


@Injectable({
  providedIn: 'root'
})
export class ExpenseDataService {

  constructor(private http: HttpClient, private modalController: ModalController) {
  }

  private readonly columnsAddExpense: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
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
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
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




  getColomnsOrder(): string[] {
    return this.columnsAddExpenseOrder;
  }

  getExpenseByUser(startDate: string, endDate: string, businessNumber: string): Observable<IRowDataTable[]> {
    const token = localStorage.getItem('token');
    const pagination = 1;
    const url = `${environment.apiUrl}expenses/get_by_userID`;
    const headers = {
      'token': token
    }
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber)
      .set('pagination', pagination)
    return this.http.get<IRowDataTable[]>(url, { params: params, headers: headers });
  }

  getExpenseForVatReport(startDate: string, endDate: string, businessNumber: string): Observable<IRowDataTable[]> {
    const url = `${environment.apiUrl}expenses/get-expenses-for-vat-report`;
    const token = localStorage.getItem('token');
    const headers = {
      'token': token
    }
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber)
    return this.http.get<IRowDataTable[]>(url, { params: params, headers: headers })
  }

  getTaxableIncome(startDate: string, endDate: string, businessNumber: string): Observable<IRowDataTable[]> {
    const url = `${environment.apiUrl}transactions/get-taxable-income`;
    const token = localStorage.getItem('token');
    const headers = {
      'token': token
    }
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber)
    return this.http.get<IRowDataTable[]>(url, { params: params, headers: headers })
  }

  getShowExpenseColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    return this.columnsDisplayExpense;
  }

  getAddExpenseColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    return this.columnsAddExpense;
  }

  getSubCategory(categoryName: string, isEquipment: boolean, isExpense: boolean = true): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/get-sub-categories`;
    const headers = {
      'token': token
    }
    const params = new HttpParams()
      .set('isEquipment', isEquipment)
      .set('isExpense', isExpense)
      .set('categoryName', categoryName);
    return this.http.get<any>(url, { params: params, headers: headers });
  }

  getcategry(isDefault?: boolean, isExpense: boolean = true): Observable<any[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/get-categories`;
    const headers = {
      'token': token
    }
    const param = new HttpParams()
      .set('isDefault', isDefault)
      .set('isExpense', isExpense)
    return this.http.get<any>(url, { params: param, headers: headers })
  }

  getAllSuppliers(): Observable<IGetSupplier[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/get-suppliers-list`;
    const headers = {
      'token': token
    }
    return this.http.get<IGetSupplier[]>(url, { headers })
  }

  addSupplier(formData: any): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/add-supplier`;
    const headers = {
      'token':
        token
    }
    return this.http.post(url, formData, { headers });
  }

  editSupplier(formData: any, id: number): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/update-supplier/` + id;
    const headers = {
      'token': token
    }
    return this.http.patch(url, formData, { headers });
  }

  deleteSupplier(id: number): Observable<any> {
    //TODO: change token to headers
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/delete-supplier/` + id;
    const param = new HttpParams()
      .set('token', token);
    return this.http.delete(url, { params: param });
  }

  addExpenseData(data: any): Observable<any> {
    //TODO: change token to headers
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/add-expense`;
    console.log("form data in send", data);
    return this.http.post(url, data);
    // return this.http.post(`${environment.apiUrl}expenses/add-expense`, data);
  }

  deleteExpense(id: number): Observable<any> {
    const url = `${environment.apiUrl}expenses/delete-expense/` + id;
    const headers = {
      'token': localStorage.getItem('token')
    }
    console.log("id in del expense", id);
    return this.http.delete(url, { headers });
  }

  updateExpenseData(data: any, id: number): Observable<any> {
    //TODO: change token to headers
    const url = `${environment.apiUrl}expenses/update-expense/${id}`;
    return this.http.patch(url, data);
  }

  openModalAddExpense(data?: IRowDataTable, editMode: boolean = false): Observable<any> {
    return from(this.modalController.create({
      component: ModalExpensesComponent,
      componentProps: {
        columns: this.columnsAddExpense,
        editMode,
        data
      },
      cssClass: 'expense-modal'
    }))
      .pipe(
        catchError((err) => {
          console.log("error in create modal add expense: ", err);
          return EMPTY;
        }),
        switchMap((modal) => from(modal.present())),
        catchError((err) => {
          console.log("error in present modal add expense: ", err);
          return EMPTY;
        }))
      //.subscribe();
  }


}

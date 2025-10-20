import { Injectable, OnInit, signal } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, catchError, map, tap } from 'rxjs';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { IClassifyTrans, IRowDataTable, ISelectItem, ITransactionData } from 'src/app/shared/interface';
import * as XLSX from 'xlsx';
import { ca } from 'date-fns/locale';


@Injectable({
  providedIn: 'root'
})
export class TransactionsService implements OnInit{

  token:string;
  accountsList = signal<ISelectItem[]>([]);
  filterData = signal<any>(null);
  
  businessList: [{businessName: string, businessNumber: string}];
  categories = signal<ISelectItem[]>([]);

  constructor(private http: HttpClient) { 
    console.log("in transaction service");
  };

  ngOnInit(): void {
    console.log("in on init trans service");
    this.setUserId();
  }

  //   ngOnDestroy(): void {
  //     this.transactionsService.accountsList$.unsubscribe();
  // }


  setUserId(): void {
    console.log("in set token");
    this.token = localStorage.getItem('token');
  }

  getTransToConfirm(startDate: string, endDate: string, businessNumber: string): Observable<IRowDataTable[]> {
    const url = `${environment.apiUrl}transactions/get-transaction-to-confirm-and-add-to-expenses`;
    const params = new HttpParams()
    // .set('billId', 'ALL_BILLS')
    .set('startDate', startDate)
    .set('endDate', endDate)
    .set('businessNumber', businessNumber);
    
    return this.http.get<IRowDataTable[]>(url, {params:params});
  }


  getTransToClassify(
    startDate?: string,
    endDate?: string,
    businessNumber?: string
  ): Observable<IRowDataTable[]> {

    const url = `${environment.apiUrl}transactions/get-trans-to-classify`;

    let params = new HttpParams();
    if (startDate)      { params = params.set('startDate', startDate); }
    if (endDate)        { params = params.set('endDate',   endDate);   }
    if (businessNumber) { params = params.set('businessNumber', businessNumber); }

    return this.http.get<IRowDataTable[]>(url, { params });
  }


  getIncomeTransactionsData(startDate: string, endDate: string, billId: string[], categories: string[], sources: string[]): Observable<ITransactionData[]> {
    const url = `${environment.apiUrl}transactions/get-incomes`;
    const param = new HttpParams()
    .set('billId', billId?.length ? billId.join(',') : 'null' )
    .set('categories', categories?.length ? categories.join(',') : 'null' )
    .set('sources', sources?.length ? sources.join(',') : 'null' )
    .set('startDate', startDate)
    .set('endDate', endDate)
    return this.http.get<ITransactionData[]>(url, {params: param})
  }
  

  getExpenseTransactionsData(startDate: string, endDate: string, billId: string[], categories: string[], sources: string[]): Observable<ITransactionData[]> {
    console.log("billId: ", billId);
    
    const url = `${environment.apiUrl}transactions/get-expenses`;
    const param = new HttpParams()
    .set('billId', billId?.length ? billId.join(',') : 'null' )
    .set('categories', categories?.length ? categories.join(',') : 'null' )
    .set('sources', sources?.length ? sources.join(',') : 'null' )
    .set('startDate', startDate)
    .set('endDate', endDate)
    return this.http.get<ITransactionData[]>(url, {params: param})
  } 

  getAllBills(): void {
    const url = `${environment.apiUrl}transactions/get-bills`;
    this.http.get<any[]>(url)
    .pipe(
      catchError((err) => {        
        if (err.error.status === 404) {
          this.accountsList.set([{ value: undefined, name: 'לא קיימים חשבונות עבור משתמש זה' }]);
        }
        this.accountsList.set([{ value: undefined, name: 'אירעה שגיאה לא ניתן להציג חשבונות קיימים' }]);
        return EMPTY;
      }),
      map((data) => {
        return data.map((bill) => {
          const { userId, ...bills } = bill;
          const newfields = this.renameFields(bills);
          return newfields;
        })
      }),
    )
    .subscribe((bills) => {
      this.updateAccountList(bills);
    })
  }

  getAllSources(): Observable<string[]> {
    const url = `${environment.apiUrl}transactions/get-sources`;
    return this.http.get<any[]>(url)
  }

  getSourcesByBillId(billId:number): Observable<string[]> {
    const url = `${environment.apiUrl}transactions/get-sources-by-bill/${billId}`;
    return this.http.get<any[]>(url)
  }

  updateAccountList(newData: any): void {
    this.accountsList.set([...newData]);
  }

  renameFields(obj: any): any {
    return {
      value: obj.id,
      name: obj.billName,
    };
  }
  
  addSource(billId: number, source: string, type: string): Observable<any> {
    //const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/${billId}/sources`;
    // const headers = {
    //   'token': token
    // }
    //return this.http.post<any[]>(url,{sourceName: source, sourceType: type},{headers:headers});
    return this.http.post<any[]>(url,{sourceName: source, sourceType: type});
  }

  addBill(billName: string, businessNumber: string): Observable<any> {
    //const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/add-bill`;
    // const headers = {
    //   'token': token
    // }
    //return this.http.post<any[]>(url,{billName, businessNumber},{headers:headers});
    return this.http.post<any[]>(url,{billName, businessNumber});
  }
  
  uploadFile(fileBuffer: ArrayBuffer): Observable<any> {
    console.log("file buffer in service: ", fileBuffer);
    //const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/load-file`;
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    console.log("blob: ", blob);
    formData.append('file', blob, 'file.xlsx');
    console.log("form data: ", formData.get('file'));
    // const headers = {
    //   'token': token
    // }
    //return this.http.post<any>(url, formData,{headers: headers});
    return this.http.post<any>(url, formData);
  }
 
  addClassifiction(formData: IClassifyTrans, date?: any): Observable<any> {
    console.log("in add classificaion");
    console.log("form data of classify trans: ",formData);
    const url = `${environment.apiUrl}transactions/classify-trans`;
    // const params = new HttpParams()
    // .set('startDate', date.startDate)
    // .set('endDate', date.endDate)
    return this.http.post<any>(url,formData);
  }

  addCategory(formData: any): Observable<any> {
    console.log("in add category");
    console.log("🚀 ~ addCategory ~ formData:", formData)
    const url = `${environment.apiUrl}expenses/add-user-category`;
    return this.http.post<any>(url, formData)
  }

  updateRow(formData: any): Observable<any> {
    // updateRow(formData: IClassifyTrans): Observable<any> {
    console.log("in update row service");
    //const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/update-trans`;
    // const headers = {
    //   'token':
    //    token
    // }
    return this.http.patch<any>(url, formData)
  }

  removeMinus(sum: string): string {
    const withoutSign = sum.replace('-', '');
    const withoutDecimal = withoutSign.split('.')[0];
    return withoutDecimal
  }

  getCategories(isDefault?: boolean, isExpense: boolean = true): Observable<ISelectItem[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/get-categories`;
    const headers = {
      'token': token
    }
    const param = new HttpParams()
      .set('isDefault', isDefault)
      .set('isExpense', isExpense)
    return this.http.get<ISelectItem[]>(url, { params: param, headers: headers })
    .pipe(
      // takeUntil(this.destroy$),
      catchError((err) => {
        console.log("error in get category", err);
        return EMPTY;
      }),
      map((res) => {
        return res.map((item: any) => ({
          name: item.categoryName,
          value: item.categoryName
        })
        )
      }),
      tap((res: ISelectItem[]) => {
        console.log("category", res);
        this.categories.set(res);
        console.log("categories", this.categories());
      })
    )
  }

     
  addTransToExpense(IDs: IRowDataTable[]): Observable<string> {
      const url = `${environment.apiUrl}transactions/save-trans-to-expenses`;
      return this.http.post<string>(url, IDs)
  }

  quickClassify(transactionId: number): Observable<any> {
    const url = `${environment.apiUrl}transactions/quick-classify`;
    return this.http.post<any>(url, { transactionId });
  }
}
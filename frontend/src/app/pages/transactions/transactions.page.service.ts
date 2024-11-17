import { Injectable, OnInit } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, catchError, map } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { IClassifyTrans, ITransactionData } from 'src/app/shared/interface';
import * as XLSX from 'xlsx';


@Injectable({
  providedIn: 'root'
})
export class TransactionsService implements OnInit{

token:string;
accountsList$ = new BehaviorSubject<any[]>([{ value: 'ALL_BILLS', name: 'כל החשבונות' }]);

// accountsList = [{ value: 'null', name: 'כל החשבונות' }];
constructor(private http: HttpClient) { 
  console.log("in transaction service");
  
};

ngOnInit(): void {
  console.log("in on init trans service");
  
  this.setUserId();
}

 setUserId(): void {
    console.log("in set token");

    this.token = localStorage.getItem('token');
  }

  // getIncomeTransactionsData(formData: any): Observable<ITransactionData[]> {
  //   const token = localStorage.getItem('token');
  //   const url = `${environment.apiUrl}transactions/get-incomes`;
  //   const param = new HttpParams()
  //   .set('billId', formData.accounts)
  //   .set('month', formData.month)
  //   .set('year', formData.year)
  //   .set('isSingleMonth', formData.isSingleMonth)
  //   const headers = {
  //     'token': token
  //   }
  //   return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  // }


  getIncomeTransactionsData(startDate: string, endDate: string, billId: any): Observable<ITransactionData[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/get-incomes`;
    const param = new HttpParams()
    .set('billId', billId)
    .set('startDate', startDate)
    .set('endDate', endDate)
    const headers = {
      'token': token
    }
    return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  }
  

  // getExpenseTransactionsData(formData: any): Observable<ITransactionData[]> {
  //   console.log(formData.accounts);
  //   const token = localStorage.getItem('token');
  //   const url = `${environment.apiUrl}transactions/get-expenses`;
  //   const param = new HttpParams()
  //   .set('billId', formData.accounts)
  //   .set('month', formData.month)
  //   .set('year', formData.year)
  //   .set('isSingleMonth', formData.isSingleMonth)
  //   const headers = {
  //     'token': token
  //   }
  //   return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  // }


  getExpenseTransactionsData(startDate: string, endDate: string, billId: any): Observable<ITransactionData[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/get-expenses`;
    const param = new HttpParams()
    .set('billId', billId)
    .set('startDate', startDate)
    .set('endDate', endDate)
    const headers = {
      'token': token
    }
    return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  }
  
  getAllBills(): void {
    const token = localStorage.getItem('token');
    console.log("get bills");
    const url = `${environment.apiUrl}transactions/get-bills`;
    const headers = {
      'token': token
    }
    this.http.get<any[]>(url, {headers: headers})
    .pipe(
      catchError((err) => {
        console.log("in if err", err);
        
        if (err.error.status === 404) {
          this.accountsList$.next([{ value: undefined, name: 'לא קיימים חשבונות עבור משתמש זה' }]);
        }
        // else{
          this.accountsList$.next([{ value: undefined, name: 'אירעה שגיאה לא ניתן להציג חשבונות קיימים' }]);
        // }
        console.log("err in get all bills: ", err);
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
      // console.log("bill list:", bills);
      this.updateAccountList(bills);
    })
  }

  getAllSources(): Observable<string[]> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/get-sources`;
    const headers = {
      'token': token
    }
    // console.log(this.token);
    
    return this.http.get<any[]>(url, {headers: headers})
  }

  updateAccountList(newData: any): void {
    const accounts = this.accountsList$.value
    const updatedTransactions = [newData];
    // const updatedTransactions = [...accounts, ...newData];

    // Emit the updated transactions
    this.accountsList$.next([...[{ value: 'ALL_BILLS', name: 'כל החשבונות' }],...newData]);
    // this.accountsList$.next(updatedTransactions);
    // console.log(this.accountsList$.value);
    
  }

  renameFields(obj: any): any {
    return {
      value: obj.id,
      name: obj.billName,
    };
  }
  
  addSource(billId: string, source: string): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/${billId}/sources`;
    const headers = {
      'token': token
    }
    return this.http.post<any[]>(url,{sourceName: source},{headers:headers});
  }

  addBill(billName: string): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/add-bill`;
    const headers = {
      'token': token
    }
    return this.http.post<any[]>(url,{billName: billName},{headers:headers});
  }
  
  uploadFile(fileBuffer: ArrayBuffer): Observable<any> {
    console.log("file buffer in service: ", fileBuffer);
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/load-file`;
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    console.log("blob: ", blob);
    formData.append('file', blob, 'file.xlsx');
    console.log("form data: ", formData.get('file'));
    const headers = {
      'token': token
    }
    return this.http.post<any>(url, formData,{headers: headers});
  }

 

  addClassifiction(formData: IClassifyTrans, date: any): Observable<any> {
    console.log("in add classificaion");
    console.log("form data of classify trans: ",formData);
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/classify-trans`;
    const headers = {
      'token':
       token
    }
    const params = new HttpParams()
    .set('year', date.year)
    .set('month', date.month)
    .set('isSingleMonth', date.isSingleMonth);
    return this.http.post<any>(url,formData,{params:params,headers: headers});
  }

  updateRow(formData: any): Observable<any> {
    // updateRow(formData: IClassifyTrans): Observable<any> {
    console.log("in update row service");
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/update-trans`;
    const headers = {
      'token':
       token
    }
    return this.http.patch<any>(url, formData, {headers:headers})
  }

  removeMinus(sum: string): string {
    const withoutSign = sum.replace('-', '');
    const withoutDecimal = withoutSign.split('.')[0];
    return withoutDecimal
  }

}
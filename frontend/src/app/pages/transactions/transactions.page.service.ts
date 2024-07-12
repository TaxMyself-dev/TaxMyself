import { Injectable, OnInit } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, catchError, map } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ITransactionData } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class TransactionsService {

token:string;
accountsList$ = new BehaviorSubject<any[]>([{ value: 'null', name: 'כל החשבונות' }]);

// accountsList = [{ value: 'null', name: 'כל החשבונות' }];
constructor(private http: HttpClient) { 
  this.setUserId();
};

  private setUserId(): void {
    this.token = localStorage.getItem('token');
  }

  getIncomeTransactionsData(formData: any): Observable<ITransactionData[]> {
    console.log(formData.accounts);
    
    const url = `${environment.apiUrl}transactions/get-incomes`;
    const param = new HttpParams()
    .set('billId', formData.accounts)
    .set('month', formData.month)
    .set('year', formData.year)
    .set('isSingleMonth', formData.isSingleMonth)
    const headers = {
      'token': this.token
    }
    return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  }
  
  getExpenseTransactionsData(formData: any): Observable<ITransactionData[]> {
    console.log(formData.accounts);
    
    const url = `${environment.apiUrl}transactions/get-expenses`;
    const param = new HttpParams()
    .set('billId', formData.accounts);
    const headers = {
      'token': this.token
    }
    return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
  }
  
  getAllBills(): void {
    console.log("get bills");
    const url = `${environment.apiUrl}transactions/get-bills`;
    const headers = {
      'token': this.token
    }
    this.http.get<any[]>(url, {headers: headers})
    .pipe(
      catchError((err) => {
        console.log("err in get all bills: ", err);
        this.accountsList$.next([{ value: undefined, name: 'אירעה שגיאה לא ניתן להציג חשבונות קיימים' }]);
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
      console.log("bill list:", bills);
      this.updateAccountList(bills);
    })
  }

  getAllSources(): Observable<string[]> {
    const url = `${environment.apiUrl}transactions/get-sources`;
    const headers = {
      'token': this.token
    }
    console.log(this.token);
    
    return this.http.get<any[]>(url, {headers: headers})
  }

  updateAccountList(newData: any): void {
    const accounts = this.accountsList$.value
    const updatedTransactions = [...accounts, ...newData];

    // Emit the updated transactions
    this.accountsList$.next(updatedTransactions);
    console.log(this.accountsList$.value);
    
  }

  renameFields(obj: any): any {
    return {
      value: obj.id,
      name: obj.billName,
    };
  }
  
  addSource(billId: string, source: string): Observable<any> {
    const url = `${environment.apiUrl}transactions/${billId}/sources`;
    const headers = {
      'token': this.token
    }
    return this.http.post<any[]>(url,{sourceName: source},{headers:headers});
  }

  addBill(billName: string): Observable<any> {
    const url = `${environment.apiUrl}transactions/add-bill`;
    const headers = {
      'token': this.token
    }
    return this.http.post<any[]>(url,{billName: billName},{headers:headers});
  }

}

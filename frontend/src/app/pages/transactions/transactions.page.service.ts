import { Injectable, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ITransactionData } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class TransactionsService {

token:string;
constructor(private http: HttpClient) { 
  this.setUserId();
};

  private setUserId(): void {
    console.log("in set");
    this.token = localStorage.getItem('token');
    // const tempA = localStorage.getItem('token');
    // const tempB = JSON.parse(tempA)
    // this.token = tempB.uid;
    console.log(this.token);
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
    const url = `${environment.apiUrl}transactions/get-incomes`;

  }

}

import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { IRowDataTable, ITransactionData } from "src/app/shared/interface";
import { environment } from "src/environments/environment";






@Injectable({
    providedIn: 'root'
  })
  export class FlowReportService {

    expensesData: IRowDataTable[];

    token: string;

    constructor(private http: HttpClient) { 
        this.setUserId();
      };

    private setUserId(): void {
        this.token = localStorage.getItem('token');
      }

    getExpenseTransactionsData(formData: any): Observable<ITransactionData[]> {
        console.log(formData.accounts);
        const token = localStorage.getItem('token');
        const url = `${environment.apiUrl}transactions/get-expenses`;
        const param = new HttpParams()
        .set('billId', 'ALL_BILLS')
        //.set('billId', formData.accounts)
        .set('month', formData.month)
        .set('year', formData.year)
        .set('isSingleMonth', formData.isSingleMonth)
        const headers = {
            'token': token
        }
        return this.http.get<ITransactionData[]>(url, {params: param, headers: headers})
    }
    
    addTransToExpense(IDs): Observable<any> {
      const token = localStorage.getItem('token');
        const url = `${environment.apiUrl}transactions/save-trans-to-expenses`;
        const headers = {
            'token': token
        }
        console.log("ids are", IDs);
        
        return this.http.post<any>(url, IDs, {headers})
    }
  }
import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { IRowDataTable } from "src/app/shared/interface";
import { environment } from "src/environments/environment";


@Injectable({
    providedIn: 'root'
  })
  export class FlowReportService {

    expensesData: IRowDataTable[];

    token: string;

    constructor(private http: HttpClient) {};

    getFlowReportData(formData: any): Observable<any> {
      const token = localStorage.getItem('token');
      const url = `${environment.apiUrl}transactions/get-transactions-to-build-report`;
      const headers = {
        'token': token
      }
      const params = new HttpParams()
      .set('billId', 'ALL_BILLS')
      .set('year', formData.year)
      .set('month', formData.month)
      .set('isSingleMonth', formData.isSingleMonth);
      return this.http.get<any>(url, {params:params, headers: headers});
    }
    
    addTransToExpense(IDs): Observable<any> {
      const token = localStorage.getItem('token');
        const url = `${environment.apiUrl}transactions/save-trans-to-expenses`;
        const headers = {
            'token': token
        }
        //console.log("ids are", IDs);
        
        return this.http.post<any>(url, IDs, {headers})
    }
  }
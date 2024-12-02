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

    getFlowReportData(startDate: string, endDate: string, businessNumber: string): Observable<any> {
      const token = localStorage.getItem('token');
      const url = `${environment.apiUrl}transactions/get-expenses-to-build-report`;
      const headers = {
        'token': token
      }
      const params = new HttpParams()
      .set('billId', 'ALL_BILLS')
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber);
      
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
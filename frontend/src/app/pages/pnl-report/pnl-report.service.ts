import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PnLReportService {

  token: string;

  constructor(private http: HttpClient) {
    this.setUserId();
  };


  private setUserId(): void {
    this.token = localStorage.getItem('token');
  }


  getPnLReportData(startDate: string, endDate: string, businessNumber: string): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}reports/pnl-report`;
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber)

    const headers = {
      'token': token
    }

    return this.http.get<any>(url, { params: params, headers: headers })
  }


  addFileToExpenses(formData: { id: number, file: string | File }[]): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/add-file-to-expense`;
    const headers = {
      'token': token
    }
    return this.http.patch<any>(url, formData, { headers: headers })

  }

  createPDF(): Observable<any> {
    console.log("in cerate service");
    const url = "https://api.fillfaster.com/v1/generatePDF";
    const headers = {
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM",
     'Content-Type': 'application/json'
    }
    const body = {
      "fid": "ydAEQsvSbC",
      "prefill_data": {
        "name": "John Doe",
        "id": "johndoe@example.com",
        "income": "+1-234-567-8901",
        "profit": "100$",
        "expenses": "123 Main Street, Anytown, USA",
        "table": [
            ["3,000","פרסום"],
            ["600","אוכל"]
        ]
      }
    }
    return this.http.post<Blob>(url, body,{ headers, responseType: 'blob' as 'json'
    });
    

  }
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ITransactionData } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class TransactionsService {

  constructor(private http: HttpClient) { };

  getTransactionsData(): Observable<ITransactionData[]> {
    const url = `${environment.apiUrl}excel/get_by_userID`;
    const params = new HttpParams()
      .set('userId', 'N0rQ3GHjlmMEfKHUPmTUn2Tv3Y72'); // TODO: remove
    return this.http.get<ITransactionData[]>(url, {params})
  }

}

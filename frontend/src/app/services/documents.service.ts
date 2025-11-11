import { Injectable, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { IRowDataTable } from 'src/app/shared/interface';


@Injectable({
  providedIn: 'root'
})
export class DocumentsService implements OnInit{

    token: string;

    constructor(private http: HttpClient) { 
    };

    ngOnInit(): void {
        this.setUserId();
    }


    setUserId(): void {
        this.token = localStorage.getItem('token');
    }


    getDocuments(
        businessNumber: string,
        startDate?: string,
        endDate?: string,
        docType?: string
        ): Observable<IRowDataTable[]> {
        const url = `${environment.apiUrl}documents/get-docs`;

        let params = new HttpParams().set('issuerBusinessNumber', businessNumber);

        if (startDate) params = params.set('startDate', startDate);
        if (endDate) params = params.set('endDate', endDate);
        if (docType) params = params.set('docType', docType);

        return this.http.get<IRowDataTable[]>(url, { params });
    }


}
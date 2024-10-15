import { Injectable, OnInit } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, catchError, map } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class MyStatusService implements OnInit{

token: string;

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

  
getUserDetails(): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}auth/get-user`;
    const headers = {
      'token': token
    }
    return this.http.get<any>(url, {headers: headers});    
    //return userData;
    //return this.http.get<any>(url, {headers: headers})
}
  

}
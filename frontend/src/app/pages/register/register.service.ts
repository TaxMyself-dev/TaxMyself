import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { IChildren } from 'src/app/shared/interface';
import { HttpClient } from '@angular/common/http';



@Injectable({
  providedIn: 'root'
})
export class RegisterService {

  public childrenRegister$: Subject<IChildren> = new Subject();
  constructor(private http: HttpClient) { }

  getCities(): Observable<any> {
    const url = "https://raw.githubusercontent.com/royts/israel-cities/master/israel-cities.json";
    return this.http.get<any>(url)
  }
}
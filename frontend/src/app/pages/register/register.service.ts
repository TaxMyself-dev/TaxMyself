import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { IChildren, ICityData } from 'src/app/shared/interface';
import { HttpClient } from '@angular/common/http';



@Injectable({
  providedIn: 'root'
})
export class RegisterService {

  public childrenRegister$: Subject<IChildren> = new Subject();
  constructor(private http: HttpClient) { }

  getCities(): Observable<ICityData[]> {
    const url = "https://raw.githubusercontent.com/royts/israel-cities/master/israel-cities.json";
    return this.http.get<ICityData[]>(url)
  }
}
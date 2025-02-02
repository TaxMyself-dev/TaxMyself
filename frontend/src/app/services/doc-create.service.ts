import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class DocCreateService {

  token: string;

  constructor(private http: HttpClient, private loader: LoadingController) { 
    this.token = localStorage.getItem('token');
  }

}

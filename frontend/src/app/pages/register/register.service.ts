import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { IChildren } from 'src/app/shared/interface';
//import { ajax } from 'ajax';


@Injectable({
  providedIn: 'root'
})
export class RegisterService {

  public childrenRegister$: Subject<IChildren> = new Subject();
  constructor() { }

  // getCities() {
  //   let data = {
  //     resource_id: 'b7cf8f14-64a2-4b33-8d4b-edb286fdbd37', 
  //     limit: 1500//1273
  // };
  // $.ajax({
  //     url: 'https://data.gov.il/api/action/datastore_search',
  //     data: data,
  //     dataType: 'json',
  //     success: (data) => {
  //     //debugger;
  //         data.result.records.map(item => console.log(item));
  //     }
  // });
  // }


  // const data = {
  //   resource_id: 'b7cf8f14-64a2-4b33-8d4b-edb286fdbd37',
  //   limit: 1500
  // };
  
  // ajax({
  //   url: 'https://data.gov.il/api/action/datastore_search',
  //   method: 'GET',
  //   headers: {
  //     'Content-Type': 'application/json'
  //   },
  //   body: data
  // }).pipe(
  //   map(response => response.response.result.records)
  // ).subscribe(
  //   records => {
  //     records.forEach(item => console.log(item));
  //   },
  //   error => {
  //     console.error('Error fetching data:', error);
  //   }
  // );
}

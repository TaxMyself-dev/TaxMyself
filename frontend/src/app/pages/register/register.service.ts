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
}

import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, Subject, catchError, from, map, switchMap, tap } from 'rxjs';
import { IToastData } from '../shared/interface';

@Injectable({
  providedIn: 'root'
})
export class GenericService {

  private loaderMessage$ = new BehaviorSubject<string>("Please wait...");
  private loaderInstance: HTMLIonLoadingElement | null = null; // Keep a reference to the loader instance
  private toastSubject = new Subject<IToastData>();

  toast$ = this.toastSubject.asObservable();

  constructor(private loader: LoadingController) { }

  showToast(message: string, type: 'success' | 'error', duration: number = 3000, color: string = 'primary', position: 'top' | 'middle' | 'bottom' = 'bottom') {
    const toastData: IToastData = {
      message,
      duration: type === 'error' ? -1 : duration,
      color,
      position,
      type
    }
    this.toastSubject.next(toastData);
  }

  getLoader(): Observable<any> {
    return from(this.loader.create({
      message: this.loaderMessage$.getValue(),
      spinner: 'crescent'
    }))
      .pipe(
        catchError((err) => {
          console.log("Error in creating loader", err);
          return EMPTY;
        }),
        switchMap((loader) => {
          if (loader) {
            console.log("in get loader");
            
            this.loaderInstance = loader;  // Store the loader instance
            return from(loader.present())
              .pipe(
                // Listen to changes in the message and update the loader's message in real time
                switchMap(() => this.loaderMessage$.asObservable()
                  .pipe(
                    tap((message) => {
                      if (this.loaderInstance) {
                        this.loaderInstance.message = message;  // Update loader message dynamically
                      }
                    })
                  )
                )
              );
          }
          console.log("Loader is null");
          return EMPTY;
        }),
        catchError((err) => {
          console.log("Error in presenting loader", err);
          return EMPTY;
        })
      );
  }

  // Method to update the loader's message dynamically
  updateLoaderMessage(message: string): void {
    this.loaderMessage$.next(message);  // Trigger message update
  }

  dismissLoader(): void {
    if (this.loaderInstance) {
      this.loaderInstance.dismiss();
      this.loaderInstance = null; // Reset the reference after dismissing
    }
    else {
      console.log("in else dissmis");
      
    }
  }

  addComma(number: number | string): string {
    if (typeof number !== 'number') {
      const tempNum = Number(number);
      return tempNum.toLocaleString();
      //throw new Error('Input must be a number');
    }
    return number.toLocaleString();
  }

  convertStringToNumber(value: string): number {
    console.log("convertStringToNumber value: ", value);
    
    if (!value) return NaN; // Handle empty or invalid input
  
    // Remove commas and convert to number
    return Number(value.replace(/,/g, ''));
  }
  
  //  orderColumns(columns: [], desiredOrder: string[]): string[] {
 
  //     return columns = [...columns].sort((a, b) => {
  //       return desiredOrder.indexOf(a.name) - desiredOrder.indexOf(b.name);
  //     });
  
  //   }

    columnsOrderByFunc(a, b, columns: string[]): number {
    
  
      const indexA = columns.indexOf(a.key);
      const indexB = columns.indexOf(b.key);
  
      if (indexA === -1 && indexB !== -1) {
        return 1; // objA is not in the order list, move it to the end
      } else if (indexA !== -1 && indexB === -1) {
        return -1; // objB is not in the order list, move it to the end
      } else if (indexA === -1 && indexB === -1) {
        return 0; // both keys are not in the order list, leave them as is
      }
  
      if (indexA < indexB) {
        return -1;
      } else if (indexA > indexB) {
        return 1;
      } else {
        return 0;
      }
    }


}

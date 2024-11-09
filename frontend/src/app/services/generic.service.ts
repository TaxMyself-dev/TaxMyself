import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, catchError, from, switchMap, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GenericService {

  private loaderMessage$ = new BehaviorSubject<string>("Please wait...");
  private loaderInstance: HTMLIonLoadingElement | null = null; // Keep a reference to the loader instance

  constructor( private loader: LoadingController) { }


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
      console.log("Updating loader message to:", message);
      this.loaderMessage$.next(message);  // Trigger message update
    }
  
    dismissLoader(): void {
      if (this.loaderInstance) {
        this.loaderInstance.dismiss();
        this.loaderInstance = null; // Reset the reference after dismissing
      }
    }
  

}

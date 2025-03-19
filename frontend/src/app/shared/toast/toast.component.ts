import { Component, OnDestroy, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { GenericService } from 'src/app/services/generic.service';
import { IToastData } from '../interface';

@Component({
    selector: 'app-toast',
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss'],
    standalone: false
})
export class ToastComponent implements OnInit, OnDestroy {

  private toastSubscription!: Subscription;
  public showToastMessage1: boolean = false;
  public showToastMessage: IToastData | null = null;
  readonly toastButtons = [
    {
      text: 'סגור',
      role: 'cancel',
      handler: () => {
        console.log('cancel clicked');
        //this.closeToast();
      },
    }
  ]

  constructor(private toastController: ToastController, private genericService: GenericService) { }

  ngOnInit() {
    // this.toastSubscription = this.genericService.toast$.subscribe(async toastData => {
    //   const toast = await this.toastController.create({
    //     message: toastData.message,
    //     duration: toastData.duration,
    //     color: toastData.color,
    //     position: toastData.position,
    //   });
    //   toast.present();
    // });

   
    this.toastSubscription = this.genericService.toast$.subscribe((toast: IToastData) => {
      if (toast) {
        this.showToastMessage = toast;
        this.showToast(toast);

        // Auto-hide the toast if it's a success toast
        if (toast.type === 'success') {
          setTimeout(() => {
            this.closeToast();
          }, toast.duration);
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.toastSubscription) {
      this.toastSubscription.unsubscribe();
    }
  }

  showToast(toast: IToastData): void {
    this.showToastMessage1 = true;
    console.log('Displaying toast:', toast.message);
    console.log('type toast:', this.showToastMessage.type);
    console.log('duration toast:', toast.duration);
    // Your logic to display the toast on the UI, e.g., show a message
  }


  closeToast(): void {
    this.showToastMessage1 = false; // Logic to hide the toast
    this.showToastMessage = null; // Logic to hide the toast
    console.log('Toast closed');
  }

}

import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { map } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';

@Component({
  selector: 'app-add-bill',
  templateUrl: './add-bill.component.html',
  styleUrls: ['./add-bill.component.scss'],
})
export class AddBillComponent  implements OnInit {

  @Input() paymentMethod: string;

  accountsList: any[] = [];
  existBill: boolean = true;
  onChangeRadio: boolean = true;
  billSelected: string;
  addBillForm: FormGroup;
  constructor(private formBuilider: FormBuilder,private transactionsService: TransactionsService, private modalCtrl: ModalController) {
    this.addBillForm = this.formBuilider.group({
      billName: new FormControl(
        '', [Validators.required,]
      ),
    })
   }

  ngOnInit() {
    this.transactionsService.accountsList$
    .pipe(
      map((data) => {
        const modifiedData = data.slice(1);
        return modifiedData
      })
      )
    .subscribe(
      (accountsList) => {
        this.accountsList = accountsList;
      }
    );
  }

//   ngOnDestroy(): void {
//     this.transactionsService.accountsList$.unsubscribe();
// }

cancel(): void {
  this.modalCtrl.dismiss(null,'cancel');
}


  radioGroupChange(event: any): void {
    this.onChangeRadio = false;
    this.billSelected = event.detail.value;
    
  }

  addSource(): void {
    this.transactionsService.addSource(this.billSelected, this.paymentMethod)
    .pipe()
    .subscribe(() => {
      this.modalCtrl.dismiss(null,'success');
    })
  }

  addBill(): void {
    const formData = this.addBillForm.value;
    this.transactionsService.addBill(formData.billName)
    .pipe()
    .subscribe(() =>{
      this.transactionsService.getAllBills();
      this.addBillForm.reset();     
    });
  }

  renameFields(obj: any): any {
    return {
      value: obj.id,
      name: obj.billName,
    };
  }

  onEnterKeyPressed(): void {
    this.addBill();
  }

}

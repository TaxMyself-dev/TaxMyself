import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { map } from 'rxjs';
import { TransactionsPage } from 'src/app/pages/transactions/transactions.page';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { log } from 'util';

@Component({
  selector: 'app-add-bill',
  templateUrl: './add-bill.component.html',
  styleUrls: ['./add-bill.component.scss'],
})
export class AddBillComponent  implements OnInit {

  @Input() paymentMethod: string;
  // @Input() accountsList: ({value: string | number; name: string | number;})[];

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
    this.transactionsService.accountsList$.subscribe(
      (accountsList) => {
        this.accountsList = accountsList;
        console.log(this.accountsList);
      }
    );
  }

//   ngOnDestroy(): void {
//     this.transactionsService.accountsList$.unsubscribe();
// }

cancel(): void {
  this.modalCtrl.dismiss(null,'cancel');
}

  clicked(event): void {
    const choose = event.target.value;
    console.log("click");
    console.log(event);
    choose === "new" ? this.existBill = false : this.existBill = true;
    this.onChangeRadio = true;
  }

  radioGroupChange(event): void {
    this.onChangeRadio = false;
    console.log(event.detail.value);
    this.billSelected = event.detail.value;
    
  }

  addSource(): void {
    this.transactionsService.addSource(this.billSelected, this.paymentMethod)
    .pipe()
    .subscribe()
  }

  addBill(): void {
    const formData = this.addBillForm.value;
    console.log(formData);
    this.transactionsService.addBill(formData.billName)
    .pipe()
    .subscribe(() =>{
      this.transactionsService.getAllBills()
      this.existBill = true;
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

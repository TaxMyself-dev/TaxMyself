import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { catchError, EMPTY, finalize, map } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { ISelectItem, IUserData } from '../interface';
import { paymentIdentifierType } from '../enums';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';

@Component({
    selector: 'app-add-bill',
    templateUrl: './add-bill.component.html',
    styleUrls: ['./add-bill.component.scss'],
    standalone: false
})
export class AddBillComponent implements OnInit {

  @Input() paymentMethod: string;

  accountsList: any[] = [];
  sourceTypes: ISelectItem[] = [{ value: paymentIdentifierType.CREDIT_CARD, name: "כרטיס אשראי" }, { value: paymentIdentifierType.BANK_ACCOUNT, name: "חשבון בנק" }]
  existBill: boolean = true;
  onChangeRadio: boolean = true;
  billSelected: string;
  typeSelected: string;
  addBillForm: FormGroup;
  businessNames: ISelectItem[] = [];
  userData: IUserData;

  constructor(private formBuilider: FormBuilder, private transactionsService: TransactionsService, private modalCtrl: ModalController, public authService: AuthService, private genericService: GenericService) {
    this.addBillForm = this.formBuilider.group({
      billName: new FormControl(
        '', [Validators.required,]
      ),
      businessNumber: new FormControl(
        '', []
      ),
    })
  }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      this.businessNames.push({name: this.userData.businessName, value: this.userData.businessNumber});
      this.businessNames.push({name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber});
      this.addBillForm.get('businessNumber')?.setValidators([Validators.required]);
    }
    else {
      this.addBillForm.get('businessNumber')?.patchValue(this.userData.businessNumber);
      console.log(this.addBillForm.get('businessNumber')?.value);
    }
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
    this.modalCtrl.dismiss(null, 'cancel');
  }


  radioGroupBillName(event: any): void {
    this.onChangeRadio = false;
    this.billSelected = event.detail.value;
    console.log("this.billSelected: ", this.billSelected);
  }
  
  radioGroupPaymentIdentifierType(event: any): void {
    this.typeSelected = event.detail.value;
    console.log("this.typeSelected: ", this.typeSelected);
    console.log("this.paymentMethod: ", this.paymentMethod);
  }

  addSource(): void {
    this.genericService.getLoader().subscribe();
    this.transactionsService.addSource(this.billSelected, this.paymentMethod, this.typeSelected)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log('err in add source: ', err);
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.modalCtrl.dismiss(null, 'success');
      })
  }

  addBill(): void {
    this.genericService.getLoader().subscribe();
    const formData = this.addBillForm.value;
    this.transactionsService.addBill(formData.billName, formData.businessNumber)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log('err in add bill: ', err);
          return EMPTY;
        })
      )
      .subscribe(() => {
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

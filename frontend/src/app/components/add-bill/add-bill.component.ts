import { Component, computed, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { InputTextComponent } from "../input-text/input-text.component";
import { ISelectItem, IUserData } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { GenericService } from 'src/app/services/generic.service';

@Component({
  selector: 'app-add-bill2',
  templateUrl: './add-bill.component.html',
  styleUrls: ['./add-bill.component.scss'],
  imports: [LeftPanelComponent, InputSelectComponent, ButtonComponent, InputTextComponent, ToastModule],
  providers: [],
})
export class AddBillComponent implements OnInit {

  authService = inject(AuthService);
  transactionService = inject(TransactionsService);
  messageService = inject(MessageService);
  private gs = inject(GenericService);
  
  // reactive bindings
  businessOptions = computed(() => this.gs.businesses());

  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  // bussinesesList = input<ISelectItem[]>([]);
  visibleChange = output<{visible: boolean, data?: boolean}>();
  addBillButtonClicked = output<any>();
  isLoading: WritableSignal<boolean> = signal(false);

  bussinesesList: ISelectItem[] = [];
  userData: IUserData;

  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      accountName: new FormControl(
        '', [Validators.required]
      ),
      businessNumber: new FormControl(
        '', []
      ),
    });
  }

  async ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    await this.gs.loadBusinesses();

    // if (this.userData.isTwoBusinessOwner) {
    //   this.bussinesesList.push({ name: this.userData?.businessName, value: this.userData.businessNumber });
    //   this.bussinesesList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    //   this.myForm.get('businessNumber')?.setValidators([Validators.required]);
    // }
    // else {
    //   this.myForm.patchValue({
    //     businessNumber: this.userData.businessNumber,
    //   });
    // }
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit({visible: visible});
  }

  addBill(event: any): void {
    this.isLoading.set(true);
    const accountName = event.controls?.['accountName']?.value;
    const businessNumber = event.controls?.['businessNumber']?.value;

    this.transactionService.addBill(accountName, businessNumber)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.log('err in add bill: ', err);
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.transactionService.getAllBills();
        this.visibleChange.emit({visible: false, data: true});
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail:"הוספת חשבונית הצליחה",
          life: 3000,
          key: 'br'
        })
      });
    
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit({visible});
  }
}

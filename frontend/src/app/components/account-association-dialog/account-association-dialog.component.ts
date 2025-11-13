import { Component, computed, effect, EventEmitter, inject, Input, input, OnInit, output, Output, Signal, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { IRowDataTable, ISelectItem } from 'src/app/shared/interface';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonSize } from '../button/button.enum';
import { vi } from 'date-fns/locale';
import { catchError, EMPTY, finalize } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-account-association-dialog',
  templateUrl: './account-association-dialog.component.html',
  styleUrls: ['./account-association-dialog.component.scss'],
  standalone: true,
  imports: [LeftPanelComponent, ButtonComponent, InputSelectComponent, ReactiveFormsModule]
})

export class AccountAssociationDialogComponent implements OnInit {
  formBuilder = inject(FormBuilder);
    messageService = inject(MessageService);
  
  transactionService = inject(TransactionsService);
  isVisible = input<boolean>(false);
  accounts = input<ISelectItem[]>([]);
  rowData = input<IRowDataTable>(null);
  visibleChange = output<{visible: boolean, data: boolean}>();
  openAddBillClicked = output<boolean>();
  isLoading: WritableSignal<boolean> = signal(false);

  buttonSize = ButtonSize;
  inputsSize = inputsSize;

  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      account: new FormControl(
        '', [Validators.required]
      ),
    });
  }

  ngOnInit() {
  }

  onVisibleChange(visible: boolean, data = false): void {
    this.visibleChange.emit({visible: visible, data: data});
  }

  associationPaymentMethod(event: any): void {
    this.isLoading.set(true);
    const len = this.rowData()?.paymentIdentifier.toString().length;
    const paymentMethodType = len === 6 ? 'BANK_ACCOUNT' : len === 4 ? 'CREDIT_CARD' : undefined; // Setting paymentMethodType based on the length of paymentIdentifier
    this.addSource(this.myForm.get('account').value, this.rowData()?.paymentIdentifier.toString(), paymentMethodType);
  }

  addSource(bill: number, paymentIdentifier: string, paymentMethodType: string ): void {
      this.transactionService.addSource(bill, paymentIdentifier, paymentMethodType)
        .pipe(
          finalize(() => this.isLoading.set(false)),
          catchError((err) => {
            console.log('err in add source: ', err);
            return EMPTY;
          })
        )
        .subscribe(() => {
          this.onVisibleChange(false, true);
          this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail:"שיוך אמצעי תשלום לחשבון בוצע בהצלחה!",
          life: 3000,
          key: 'br'
        })
        })
    }

  openAddBill(): void {
    this.openAddBillClicked.emit(true)
  }

}

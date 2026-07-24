import { Component, effect, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { InputTextComponent } from "../input-text/input-text.component";
import { ISelectItem, IUserData } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { catchError, EMPTY, finalize, timeout } from 'rxjs';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { GenericService } from 'src/app/services/generic.service';
import { BusinessStatus } from 'src/app/shared/enums';
import { NetworkStatusService } from 'src/app/services/pwa/network-status.service';
import { classifyRequestError, RequestFailureKind } from 'src/app/shared/errors/request-error-classification';

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
  private network = inject(NetworkStatusService);

  /**
   * Bound this single mutation so its loading state can never hang forever if the
   * backend accepts the request but never responds. Not a global HTTP timeout.
   */
  private static readonly ADD_BILL_TIMEOUT_MS = 25_000;

  /**
   * True after an *ambiguous* add-account result (timeout / transport failure
   * that may already have reached the server). Blocks a blind re-submit until the
   * existing accounts have been re-fetched once connectivity returns.
   */
  readonly awaitingAccountsRecheck = signal(false);
  
  // reactive bindings
  // businessOptions = computed(() => this.gs.businesses());
  businessOptions = this.gs.businessSelectItems;  

  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  // bussinesesList = input<ISelectItem[]>([]);
  visibleChange = output<{visible: boolean, data?: boolean}>();
  addBillButtonClicked = output<any>();
  isLoading: WritableSignal<boolean> = signal(false);

  bussinesesList: ISelectItem[] = [];
  userData: IUserData;

  BusinessStatus = BusinessStatus;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
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

    // After an ambiguous result, re-fetch the account list exactly once when the
    // backend becomes reachable again — using the existing safe GET loader. This
    // never re-submits the creation request; it only lets the user see whether
    // the account was in fact created before they try again.
    effect(() => {
      const online = this.network.isOnline();
      if (online && this.awaitingAccountsRecheck()) {
        this.transactionService.getAllBills();
        this.awaitingAccountsRecheck.set(false);
      }
    });
  }

  async ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData?.businessStatus === BusinessStatus.MULTI_BUSINESS) {
      this.myForm.get('businessNumber')?.setValidators([Validators.required]);
      this.myForm.get('businessNumber')?.updateValueAndValidity();
    } else if (this.userData?.businessStatus === BusinessStatus.NO_BUSINESS) {
      this.myForm.get('businessNumber')?.setValue(this.userData.id);
    } else {
      this.myForm.get('businessNumber')?.setValue(this.userData?.businessNumber ?? '');
    }
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit({visible: visible});
  }

  addBill(event: any): void {
    // Guard: don't allow a blind retry until an ambiguous previous attempt has
    // been reconciled against the server's actual account list.
    if (this.awaitingAccountsRecheck()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'שים לב',
        detail: 'ממתינים לאימות מול השרת. יש לרענן את רשימת החשבונות לפני ניסיון נוסף.',
        life: 5000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);
    const accountName = event.controls?.['accountName']?.value;
    const businessNumber = event.controls?.['businessNumber']?.value;

    this.transactionService.addBill(accountName, businessNumber)
      .pipe(
        // Bound only this mutation — success, error, or silence all end loading.
        timeout(AddBillComponent.ADD_BILL_TIMEOUT_MS),
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.log('err in add bill: ', err);
          this.handleAddBillError(err);
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.transactionService.getAllBills();
        this.visibleChange.emit({visible: false, data: true});
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail:"הוספת חשבון הצליחה",
          life: 3000,
          key: 'br'
        })
      });

  }

  /**
   * Map a centralized request-failure classification to an add-account message.
   * Never retries or replays the POST; only the ambiguous case arms a one-time
   * account-list re-check (see the effect in the constructor).
   */
  private handleAddBillError(err: unknown): void {
    // Preserve the existing "already exists" handling regardless of classification.
    const isConflict = (err as any)?.status === 409 || (err as any)?.error?.status === 409;
    if (isConflict) {
      this.showError('חשבון בשם הזה כבר קיים במערכת.');
      return;
    }

    switch (classifyRequestError(err)) {
      case RequestFailureKind.OFFLINE_NOT_SENT:
        this.showError('אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.');
        return;

      case RequestFailureKind.AMBIGUOUS:
        // The request may already have reached the server — do NOT claim failure.
        this.awaitingAccountsRecheck.set(true);
        this.showError(
          'לא ניתן לאמת אם החשבון נוסף בגלל בעיית חיבור. לאחר חזרת החיבור יש לרענן את רשימת החשבונות לפני ניסיון נוסף.',
        );
        return;

      case RequestFailureKind.SERVER_ERROR:
        this.showError('אירעה שגיאה בהוספת החשבון. נסה שוב מאוחר יותר.');
        return;

      case RequestFailureKind.VALIDATION:
      default:
        // Other 4xx / unexpected — preserve the existing safe generic message.
        this.showError('אירעה שגיאה בהוספת החשבון. אנא נסה שנית.');
        return;
    }
  }

  private showError(detail: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'שגיאה',
      detail,
      life: 5000,
      key: 'br'
    });
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit({visible});
  }
}

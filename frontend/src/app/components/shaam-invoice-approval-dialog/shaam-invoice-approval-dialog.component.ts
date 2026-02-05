import { Component, inject, input, output, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { InputTextComponent } from '../input-text/input-text.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import { ShaamService } from 'src/app/services/shaam.service';
import { AuthService } from 'src/app/services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { catchError, EMPTY, finalize } from 'rxjs';
import { IShaamApprovalRequest, IShaamApprovalResponse } from 'src/app/shared/interface';

@Component({
  selector: 'app-shaam-invoice-approval-dialog',
  templateUrl: './shaam-invoice-approval-dialog.component.html',
  styleUrls: ['./shaam-invoice-approval-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, ButtonComponent, InputDateComponent, InputTextComponent, ReactiveFormsModule, ConfirmDialogModule],
  providers: [ConfirmationService]
})
export class ShaamInvoiceApprovalDialogComponent {
  formBuilder = inject(FormBuilder);
  messageService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  shaamService = inject(ShaamService);
  authService = inject(AuthService);

  isVisible = input<boolean>(false);
  businessNumber = input<string | undefined>(undefined);
  
  /**
   * Gets the business number - either from input or from AuthService
   */
  private getBusinessNumber(): string | null {
    const inputBusinessNumber = this.businessNumber();
    if (inputBusinessNumber) {
      return inputBusinessNumber;
    }
    // Fallback to AuthService if not provided
    return this.authService.getActiveBusinessNumber() || this.authService.getUserBussinesNumber() || null;
  }
  
  visibleChange = output<{ visible: boolean }>();
  approvalSuccess = output<{ response: IShaamApprovalResponse }>();
  
  isLoading: WritableSignal<boolean> = signal(false);
  approvalResponse: WritableSignal<IShaamApprovalResponse | null> = signal(null);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  
  approvalForm: FormGroup;

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    
    this.approvalForm = this.formBuilder.group({
      user_id: new FormControl('304902133', [Validators.required]), // Will be overridden with businessNumber
      accounting_software_number: new FormControl('258001', [Validators.required]), // Fixed company number
      amount_before_discount: new FormControl('1000', [Validators.required, Validators.min(0)]),
      customer_vat_number: new FormControl('204245724', [Validators.required]),
      discount: new FormControl('0', [Validators.required, Validators.min(0)]),
      invoice_date: new FormControl(today, [Validators.required]),
      invoice_id: new FormControl('', [Validators.required]),
      invoice_issuance_date: new FormControl(today, [Validators.required]),
      invoice_reference_number: new FormControl('', [Validators.required]),
      invoice_type: new FormControl('305', [Validators.required]),
      payment_amount: new FormControl('1000', [Validators.required, Validators.min(0)]),
      payment_amount_including_vat: new FormControl('1180', [Validators.required, Validators.min(0)]),
      vat_amount: new FormControl('180', [Validators.required, Validators.min(0)]),
      vat_number: new FormControl('777777715', [Validators.required]),
    });

    // Add custom validator to ensure payment_amount_including_vat = payment_amount + vat_amount
    this.approvalForm.addValidators(this.validatePaymentAmounts.bind(this));
  }

  private validatePaymentAmounts(form: FormGroup): { [key: string]: any } | null {
    const paymentAmount = parseFloat(form.get('payment_amount')?.value || '0');
    const vatAmount = parseFloat(form.get('vat_amount')?.value || '0');
    const paymentAmountIncludingVat = parseFloat(form.get('payment_amount_including_vat')?.value || '0');
    
    const expected = paymentAmount + vatAmount;
    const difference = Math.abs(paymentAmountIncludingVat - expected);
    
    if (difference > 0.01) {
      return { paymentAmountMismatch: true };
    }
    
    return null;
  }

  onVisibleChange(visible: boolean): void {
    this.visibleChange.emit({ visible });
  }

  onCancel(): void {
    this.approvalForm.reset();
    this.approvalResponse.set(null);
    this.onVisibleChange(false);
  }

  onDialogContentClick(event: Event): void {
    event.stopPropagation();
  }

  onSubmit(): void {
    if (this.approvalForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא מלא את כל השדות הנדרשים בצורה תקינה',
        life: 3000,
        key: 'br'
      });
      return;
    }

    // Check payment amount validation
    if (this.approvalForm.hasError('paymentAmountMismatch')) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'סכום כולל מע"מ חייב להיות שווה לסכום תשלום + סכום מע"מ',
        life: 3000,
        key: 'br'
      });
      return;
    }

    // Get businessNumber - from input or AuthService
    const businessNumber = this.getBusinessNumber();
    if (!businessNumber) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'מספר עסק לא זוהה. אנא בחר עסק תחילה',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);

    // Get valid access token from backend (checks validity and refreshes if needed)
    this.shaamService.getValidAccessToken(businessNumber)
      .pipe(
        catchError((error) => {
          const errorMessage = error.error?.message || error.message || 'שגיאה בבדיקת חיבור לשעמ';
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: errorMessage,
            life: 5000,
            key: 'br'
          });
          this.isLoading.set(false);
          return EMPTY;
        })
      )
      .subscribe((tokenData) => {
        if (!tokenData || !tokenData.accessToken) {
          // No valid connection exists, show confirmation dialog
          this.isLoading.set(false);
          this.showShaamConnectionRequiredDialog(businessNumber);
          return;
        }

        // We have a valid access token, proceed with submission
        const formValue = this.approvalForm.value;
        
        // Prepare request data
        // user_id should be businessNumber, accounting_software_number should be fixed 258001
        const approvalData: IShaamApprovalRequest = {
          user_id: parseInt(businessNumber) || 0, // Use businessNumber instead of form value
          accounting_software_number: 258001, // Fixed company number
          amount_before_discount: parseFloat(formValue.amount_before_discount),
          customer_vat_number: parseInt(formValue.customer_vat_number),
          discount: parseFloat(formValue.discount || '0'),
          invoice_date: formValue.invoice_date,
          invoice_id: formValue.invoice_id,
          invoice_issuance_date: formValue.invoice_issuance_date,
          invoice_reference_number: formValue.invoice_reference_number,
          invoice_type: parseInt(formValue.invoice_type),
          payment_amount: parseFloat(formValue.payment_amount),
          payment_amount_including_vat: parseFloat(formValue.payment_amount_including_vat),
          vat_amount: parseFloat(formValue.vat_amount),
          vat_number: parseInt(formValue.vat_number),
        };

        this.shaamService.submitInvoiceApproval(tokenData.accessToken, approvalData)
          .pipe(
            catchError((error) => {
              const errorMessage = error.error?.message || error.message || 'שגיאה בשליחת הבקשה';
              this.messageService.add({
                severity: 'error',
                summary: 'שגיאה',
                detail: errorMessage,
                life: 5000,
                key: 'br'
              });
              return EMPTY;
            }),
            finalize(() => {
              this.isLoading.set(false);
            })
          )
          .subscribe((response: IShaamApprovalResponse) => {
            this.approvalResponse.set(response);
            
            if (response.approved && response.confirmation_number) {
              this.messageService.add({
                severity: 'success',
                summary: 'הצלחה',
                detail: `מספר הקצאה: ${response.confirmation_number}`,
                life: 5000,
                key: 'br'
              });
              this.approvalSuccess.emit({ response });
            } else {
              this.messageService.add({
                severity: 'warn',
                summary: 'החשבונית לא אושרה',
                detail: response.message || 'החשבונית לא אושרה על ידי שעמ',
                life: 5000,
                key: 'br'
              });
            }
          });
      });
  }

  get confirmationNumber(): string | null {
    return this.approvalResponse()?.confirmation_number || null;
  }

  get isApproved(): boolean {
    return this.approvalResponse()?.approved || false;
  }

  // Show dialog when SHAAM connection is required
  private showShaamConnectionRequiredDialog(businessNumber: string | undefined): void {
    this.confirmationService.confirm({
      message: 'על מנת להמשיך בתהליך יש לבצע התחברות לאיזור האישי ברשות המיסים ולתת הרשאה למערכת לבצע עבורך את הפעולה',
      header: 'התחברות נדרשת',
      icon: 'pi pi-info-circle',
      acceptLabel: 'מעבר לאתר רשות המיסים',
      rejectLabel: 'ביטול',
      acceptVisible: true,
      rejectVisible: true,
      accept: () => {
        // Redirect to SHAAM OAuth flow
        this.shaamService.initiateOAuthFlow(businessNumber);
      },
      reject: () => {
        // User cancelled, do nothing
      }
    });
  }
}


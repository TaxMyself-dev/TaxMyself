import { Component, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-feezback-transactions-dialog',
  templateUrl: './feezback-transactions-dialog.component.html',
  styleUrls: ['./feezback-transactions-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, ButtonComponent, InputDateComponent, ReactiveFormsModule]
})
export class FeezbackTransactionsDialogComponent implements OnInit {
  formBuilder = inject(FormBuilder);
  messageService = inject(MessageService);
  adminPanelService = inject(AdminPanelService);

  isVisible = input<boolean>(false);
  firebaseId = input<string>('');
  clientName = input<string>('');
  
  visibleChange = output<{ visible: boolean }>();
  isLoading: WritableSignal<boolean> = signal(false);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  dateForm: FormGroup;

  constructor() {
    const today = new Date();
    const firstOfYear = new Date(today.getFullYear(), 0, 1);
    
    this.dateForm = this.formBuilder.group({
      startDate: new FormControl(
        firstOfYear.toISOString().split('T')[0],
        [Validators.required]
      ),
      endDate: new FormControl(
        today.toISOString().split('T')[0],
        [Validators.required]
      ),
    });
  }

  ngOnInit() {}

  onVisibleChange(visible: boolean): void {
    this.visibleChange.emit({ visible });
  }

  onCancel(): void {
    this.onVisibleChange(false);
  }

  onDialogContentClick(event: Event): void {
    event.stopPropagation();
  }

  onFetchTransactions(): void {
    if (this.dateForm.invalid || !this.firebaseId()) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא מלא את כל השדות הנדרשים',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);
    const formValue = this.dateForm.value;
    
    // Ensure dates are in YYYY-MM-DD format
    const normalizeDate = (date: any): string => {
      if (!date) return '';
      
      // If it's a Date object, convert to YYYY-MM-DD
      if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }
      
      // If it's a string, check the format
      if (typeof date === 'string') {
        // If format is yy-mm-dd (2-digit year), convert to yyyy-mm-dd
        const yyFormat = /^(\d{2})-(\d{2})-(\d{2})$/;
        const match = date.match(yyFormat);
        if (match) {
          const year = parseInt(match[1]);
          // Assume years 00-50 are 2000-2050, 51-99 are 1951-1999
          const fullYear = year <= 50 ? 2000 + year : 1900 + year;
          return `${fullYear}-${match[2]}-${match[3]}`;
        }
        
        // If already in yyyy-mm-dd format, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
      }
      
      return date.toString();
    };
    
    const startDate = normalizeDate(formValue.startDate);
    const endDate = normalizeDate(formValue.endDate);
    
    this.adminPanelService.fetchFeezbackTransactions(
      this.firebaseId(),
      startDate,
      endDate
    )
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.error('Error fetching Feezback transactions:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לטעון את התנועות. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Feezback transactions response:', response);
          
          // Check if there was a database save error
          if (response?.databaseSaveError) {
            this.messageService.add({
              severity: 'warn',
              summary: 'אזהרה',
              detail: `נטענו ${response?.totalTransactions || 0} תנועות מ-Feezback, אך הייתה שגיאה בשמירה למסד הנתונים: ${response.databaseSaveError}`,
              life: 8000,
              key: 'br'
            });
            this.onVisibleChange(false);
            return;
          }
          
          // Show message with saved count from database
          const savedCount = response?.databaseSaveResult?.saved || 0;
          const skippedCount = response?.databaseSaveResult?.skipped || 0;
          const totalFetched = response?.totalTransactions || 0;
          
          let detailMessage = '';
          if (savedCount > 0) {
            detailMessage = `נשמרו ${savedCount} תנועות חדשות בהצלחה עבור ${this.clientName()}`;
            if (skippedCount > 0) {
              detailMessage += ` (${skippedCount} תנועות כבר קיימות, ${totalFetched} סה"כ נטענו)`;
            } else {
              detailMessage += ` (${totalFetched} סה"כ נטענו)`;
            }
          } else if (skippedCount > 0) {
            detailMessage = `כל התנועות כבר קיימות במערכת (${skippedCount} תנועות, ${totalFetched} סה"כ נטענו) עבור ${this.clientName()}`;
          } else if (totalFetched > 0) {
            detailMessage = `נטענו ${totalFetched} תנועות עבור ${this.clientName()}, אך לא נשמרו למסד הנתונים`;
          } else {
            detailMessage = `לא נמצאו תנועות עבור ${this.clientName()}`;
          }
          
          this.messageService.add({
            severity: savedCount > 0 ? 'success' : 'info',
            summary: savedCount > 0 ? 'הצלחה' : 'מידע',
            detail: detailMessage,
            life: 6000,
            key: 'br'
          });
          this.onVisibleChange(false);
        },
        error: (err) => {
          console.error('Error in subscribe:', err);
          // Error is already handled in catchError, but just in case
          this.isLoading.set(false);
        }
      });
  }
}


import { Component, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import {
  AdminFeezbackDateRangePullResult,
  AdminFeezbackSourcePullResult,
  AdminFeezbackSourceSelection,
  AdminPanelService,
} from 'src/app/services/admin-panel.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';

interface FeezbackSourceOption extends AdminFeezbackSourceSelection {
  key: string;
  label: string;
  detail: string;
  disabled: boolean;
}

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
  debugResult = signal<AdminFeezbackDateRangePullResult | null>(null);
  debugError = signal<any | null>(null);
  debugStartedAt = signal<string | null>(null);
  sourcesLoading = signal(false);
  sourcesError = signal<string | null>(null);
  sourceOptions = signal<FeezbackSourceOption[]>([]);
  selectedSourceKeys = signal<string[]>([]);

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

  ngOnInit(): void {
    this.loadSources();
  }

  private loadSources(): void {
    if (!this.firebaseId()) return;
    this.sourcesLoading.set(true);
    this.sourcesError.set(null);
    this.adminPanelService.getFeezbackSources(this.firebaseId())
      .pipe(finalize(() => this.sourcesLoading.set(false)))
      .subscribe({
        next: data => {
          const options: FeezbackSourceOption[] = [];
          for (const account of data?.accounts?.accounts ?? []) {
            if (!account?.resourceId) continue;
            const suffix = account?.iban?.trim()?.slice(-7) ?? account.resourceId;
            options.push({
              key: `bank:${account.resourceId}`,
              type: 'bank',
              resourceId: account.resourceId,
              label: `חשבון בנק ${suffix}`,
              detail: [account?.name, account?.ownerName, account?.currency].filter(Boolean).join(' · '),
              disabled: false,
            });
          }
          for (const card of data?.cards?.cards ?? []) {
            if (!card?.resourceId) continue;
            const lastFour = card?.maskedPan?.match(/(\d{4})$/)?.[1] ?? card.resourceId;
            const isDirect = !(Array.isArray(card?.balances) && card.balances.length > 0);
            options.push({
              key: `card:${card.resourceId}`,
              type: 'card',
              resourceId: card.resourceId,
              label: `כרטיס אשראי ${lastFour}`,
              detail: isDirect
                ? 'כרטיס Direct — התנועות נטענות דרך חשבון הבנק'
                : [card?.name, card?.ownerName, card?.currency].filter(Boolean).join(' · '),
              disabled: isDirect,
            });
          }
          this.sourceOptions.set(options);
          this.selectedSourceKeys.set(options.filter(option => !option.disabled).map(option => option.key));
        },
        error: err => {
          this.sourcesError.set(err?.error?.message ?? err?.message ?? 'טעינת החשבונות והכרטיסים נכשלה');
        },
      });
  }

  isSourceSelected(option: FeezbackSourceOption): boolean {
    return this.selectedSourceKeys().includes(option.key);
  }

  toggleSource(option: FeezbackSourceOption, checked: boolean): void {
    if (option.disabled) return;
    const selected = new Set(this.selectedSourceKeys());
    checked ? selected.add(option.key) : selected.delete(option.key);
    this.selectedSourceKeys.set([...selected]);
  }

  selectAllSources(checked: boolean): void {
    this.selectedSourceKeys.set(
      checked ? this.sourceOptions().filter(option => !option.disabled).map(option => option.key) : [],
    );
  }

  allSelectableSourcesSelected(): boolean {
    const selectable = this.sourceOptions().filter(option => !option.disabled);
    return selectable.length > 0 && selectable.every(option => this.isSourceSelected(option));
  }

  onVisibleChange(visible: boolean): void {
    this.visibleChange.emit({ visible });
  }

  onCancel(): void {
    this.onVisibleChange(false);
  }

  onDialogContentClick(event: Event): void {
    event.stopPropagation();
  }

  copyJson(value: unknown): void {
    this.copyText(JSON.stringify(value, null, 2) ?? String(value));
  }

  copyText(value: string): void {
    void this.copyToClipboard(value);
  }

  private async copyToClipboard(value: string): Promise<void> {
    let copied = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Some browsers expose Clipboard API but still deny it in dialogs/iframes.
      }
    }

    if (!copied) {
      copied = this.copyWithTextarea(value);
    }

    this.messageService.add({
      severity: copied ? 'success' : 'error',
      summary: copied ? 'הועתק' : 'ההעתקה נכשלה',
      detail: copied ? 'הנתונים הועתקו ללוח' : 'הדפדפן חסם את הגישה ללוח ההעתקה',
      life: 2500,
      key: 'br',
    });
  }

  private copyWithTextarea(value: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  resultStatusLabel(result: AdminFeezbackDateRangePullResult): string {
    if (result.status === 'success') return 'המשיכה הסתיימה בהצלחה';
    if (result.status === 'partial' && result.totalTransactions > 0) {
      return 'התנועות נטענו, אך חלק ממקורות Feezback החזירו שגיאה';
    }
    if (result.status === 'partial') return 'המשיכה הסתיימה חלקית';
    return 'המשיכה נכשלה';
  }

  sourceStatusLabel(source: AdminFeezbackSourcePullResult): string {
    if (source.status === 'success') return 'נטען בהצלחה';
    if (source.status === 'skipped_direct') return 'לא נמשך — כרטיס Direct';
    return 'המשיכה נכשלה';
  }

  discoveryHttpCalls(result: AdminFeezbackDateRangePullResult) {
    return result.request.httpCalls.filter(call => !call.url.includes('/transactions'));
  }

  formatTimestamp(value: string | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Asia/Jerusalem',
    }).format(new Date(value));
  }

  onFetchTransactions(): void {
    if (this.dateForm.invalid || !this.firebaseId() || this.selectedSourceKeys().length === 0) {
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
    this.debugResult.set(null);
    this.debugError.set(null);
    this.debugStartedAt.set(new Date().toISOString());
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
    const selectedKeys = new Set(this.selectedSourceKeys());
    const selectedSources = this.sourceOptions()
      .filter(option => selectedKeys.has(option.key))
      .map(({ type, resourceId }) => ({ type, resourceId }));
    
    this.adminPanelService.fetchFeezbackTransactions(
      this.firebaseId(),
      startDate,
      endDate,
      selectedSources,
    )
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.error('Error fetching Feezback transactions:', err);
          this.debugError.set({
            requestedAt: this.debugStartedAt(),
            receivedAt: new Date().toISOString(),
            status: err?.status ?? null,
            statusText: err?.statusText ?? null,
            response: err?.error ?? null,
            message: err?.message ?? 'Unknown error',
          });
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
          this.debugResult.set(response);
          
          // Check if there was a database save error
          if (response?.databaseSaveError) {
            this.messageService.add({
              severity: 'warn',
              summary: 'אזהרה',
              detail: `נטענו ${response?.totalTransactions || 0} תנועות מ-Feezback, אך הייתה שגיאה בשמירה למסד הנתונים: ${response.databaseSaveError}`,
              life: 8000,
              key: 'br'
            });
            return;
          }
          
          // Show message with saved count from database
          const savedCount = response?.databaseSaveResult?.saved || 0;
          const skippedCount = response?.databaseSaveResult?.skipped || 0;
          const totalFetched = response?.totalTransactions || 0;
          
          const errorCount = response.response?.errors?.length ?? 0;
          let detailMessage = '';
          if (response.status === 'failed') {
            detailMessage = `המשיכה מ-Feezback נכשלה עבור ${this.clientName()}. פרטי השגיאה מוצגים בחלון.`;
          } else if (savedCount > 0) {
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

          if (response.status === 'partial') {
            detailMessage += ` חלק מהמשיכה הצליח, אך ${errorCount} מקור/שלב נכשלו. פרטי השגיאות מוצגים בחלון.`;
          }

          const severity = response.status === 'failed'
            ? 'error'
            : response.status === 'partial'
              ? 'warn'
              : savedCount > 0
                ? 'success'
                : 'info';
          const summary = response.status === 'failed'
            ? 'המשיכה נכשלה'
            : response.status === 'partial'
              ? 'המשיכה הסתיימה חלקית'
              : savedCount > 0
                ? 'הצלחה'
                : 'מידע';
          
          this.messageService.add({
            severity,
            summary,
            detail: detailMessage,
            life: 6000,
            key: 'br'
          });
        },
        error: (err) => {
          console.error('Error in subscribe:', err);
          // Error is already handled in catchError, but just in case
          this.isLoading.set(false);
        }
      });
  }
}


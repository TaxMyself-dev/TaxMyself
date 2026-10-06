import { Component, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import {
  AdminFeezbackDateRangePullResult,
  AdminFeezbackSuspectedDuplicate,
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
  supportMessage = signal<string | null>(null);
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
              label: `Bank account ${suffix}`,
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
              label: `Credit card ${lastFour}`,
              detail: isDirect
                ? 'Direct card — transactions are loaded through the bank account'
                : [card?.name, card?.ownerName, card?.currency].filter(Boolean).join(' · '),
              disabled: isDirect,
            });
          }
          this.sourceOptions.set(options);
          this.selectedSourceKeys.set(options.filter(option => !option.disabled).map(option => option.key));
        },
        error: err => {
          this.sourcesError.set(err?.error?.message ?? err?.message ?? 'Failed to load accounts and cards');
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
      summary: copied ? 'Copied' : 'Copy failed',
      detail: copied ? 'The data was copied to the clipboard' : 'The browser blocked clipboard access',
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
    if (result.status === 'success') return 'Pull completed successfully';
    if (result.status === 'partial' && result.totalTransactions > 0) {
      return 'Transactions were loaded, but some Feezback sources returned an error';
    }
    if (result.status === 'partial') return 'Pull completed partially';
    return 'Pull failed';
  }

  sourceStatusLabel(source: AdminFeezbackSourcePullResult): string {
    if (source.status === 'success') return 'Loaded successfully';
    if (source.status === 'skipped_direct') return 'Skipped — Direct card';
    return 'Pull failed';
  }

  discoveryHttpCalls(result: AdminFeezbackDateRangePullResult) {
    return result.request.httpCalls.filter(call => !call.url.includes('/transactions'));
  }

  prepareFeezbackSupportPackage(result: AdminFeezbackDateRangePullResult): void {
    this.supportMessage.set(this.buildFeezbackSupportMessage(result));
  }

  copyDiagnosticBundle(result: AdminFeezbackDateRangePullResult): void {
    this.copyJson(this.sanitizeForExport(result));
  }

  formattedDiagnosticJson(result: AdminFeezbackDateRangePullResult): string {
    return JSON.stringify(this.sanitizeForExport(result), null, 2);
  }

  downloadDiagnosticBundle(result: AdminFeezbackDateRangePullResult): void {
    const safeResult = this.sanitizeForExport(result);
    const blob = new Blob([JSON.stringify(safeResult, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `feezback-diagnostic-${result.diagnosticId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private buildFeezbackSupportMessage(result: AdminFeezbackDateRangePullResult): string {
    const sourceLines = result.sourceResults.map(source => {
      const calls = source.httpCalls.map(call =>
        `  - ${call.method} ${call.url}\n    sentAt=${call.sentAt}; receivedAt=${call.receivedAt ?? '—'}; HTTP=${call.status ?? '—'}; attempt=${call.attempt}/${call.maxAttempts}`,
      ).join('\n');
      return [
        `- ${source.type.toUpperCase()} ${source.sourceId}`,
        `  API version: ${source.apiVersion}`,
        `  resourceId: ${source.resourceId}`,
        `  consentId: ${source.consentId ?? '—'}`,
        `  status: ${source.status}`,
        `  transactions: ${source.transactionCount}`,
        calls || '  - No transaction HTTP call was recorded',
        source.error == null ? '' : `  error: ${JSON.stringify(this.sanitizeForExport(source.error))}`,
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const duplicateLines = result.suspectedDuplicates.length === 0
      ? 'No suspected duplicate groups were detected.'
      : result.suspectedDuplicates.map(duplicate => this.formatDuplicateForSupport(duplicate)).join('\n\n');

    return [
      'Subject: Review of duplicate or anomalous transactions in Feezback API V2',
      '',
      'Hello,',
      'Attached is a diagnostic bundle from a transaction pull performed through Feezback.',
      '',
      `Diagnostic ID: ${result.diagnosticId}`,
      `Provider: ${result.request.provider}`,
      `sub: ${result.request.sub}`,
      `userIdentifier: ${result.request.userIdentifier}`,
      `Range: ${result.request.dateFrom} — ${result.request.dateTo}`,
      `bookingStatus: ${result.request.bookingStatus}`,
      `Request sentAt: ${result.request.sentAt}`,
      `Response receivedAt: ${result.response.receivedAt}`,
      `Duration: ${result.response.durationMs}ms`,
      `Overall status: ${result.status}`,
      `Persistence mode: ${result.persistenceMode}`,
      `Transactions returned: ${result.totalTransactions}`,
      '',
      'Sources and HTTP calls:',
      sourceLines || 'No sources were recorded.',
      '',
      'Duplicate findings:',
      duplicateLines,
      '',
      'The attached JSON includes the raw response, extracted transactions, and our normalized transactions.',
      'Authorization details and secrets have been redacted.',
    ].join('\n');
  }

  private formatDuplicateForSupport(duplicate: AdminFeezbackSuspectedDuplicate): string {
    return [
      `- source=${duplicate.sourceType}:${duplicate.sourceId}`,
      `  resourceId=${duplicate.resourceId}`,
      `  date=${duplicate.transactionDate}`,
      `  merchant=${duplicate.merchantName}`,
      `  amount=${duplicate.amount} ${duplicate.currency}`,
      `  noteHash=${duplicate.noteHash}`,
      `  provider transaction IDs=${duplicate.externalTransactionIds.join(', ')}`,
    ].join('\n');
  }

  private sanitizeForExport<T>(value: T): T {
    const sensitiveKey = /authorization|access[_-]?token|refresh[_-]?token|password|private[_-]?key|client[_-]?secret/i;
    const visit = (current: unknown, key = ''): unknown => {
      if (sensitiveKey.test(key)) return '<REDACTED>';
      if (typeof current === 'string') {
        return current
          .replace(/(Authorization:\s*)(?!<REDACTED>)(?:Bearer\s+)?[^'"\r\n]+/gi, '$1<REDACTED>')
          .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<REDACTED>');
      }
      if (Array.isArray(current)) return current.map(item => visit(item));
      if (current && typeof current === 'object') {
        return Object.fromEntries(
          Object.entries(current as Record<string, unknown>).map(([childKey, childValue]) => [
            childKey,
            visit(childValue, childKey),
          ]),
        );
      }
      return current;
    };
    return visit(value) as T;
  }

  formatTimestamp(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  onFetchTransactions(persistTransactions = true): void {
    if (this.dateForm.invalid || !this.firebaseId() || this.selectedSourceKeys().length === 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please complete all required fields',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);
    this.debugResult.set(null);
    this.debugError.set(null);
    this.supportMessage.set(null);
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
      persistTransactions,
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
            summary: 'Error',
            detail: 'Failed to load transactions. Please try again later.',
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
              summary: 'Warning',
              detail: `${response?.totalTransactions || 0} transactions were loaded from Feezback, but saving to the database failed: ${response.databaseSaveError}`,
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
          if (response.persistenceMode === 'diagnostic' && response.status !== 'failed') {
            detailMessage = `The Feezback diagnostic completed for ${this.clientName()}. ${totalFetched} transactions were received and no transactions were saved.`;
          } else if (response.status === 'failed') {
            detailMessage = `The Feezback pull failed for ${this.clientName()}. Error details are shown in the dialog.`;
          } else if (savedCount > 0) {
            detailMessage = `${savedCount} new transactions were saved successfully for ${this.clientName()}`;
            if (skippedCount > 0) {
              detailMessage += ` (${skippedCount} already existed, ${totalFetched} loaded in total)`;
            } else {
              detailMessage += ` (${totalFetched} loaded in total)`;
            }
          } else if (skippedCount > 0) {
            detailMessage = `All transactions already exist for ${this.clientName()} (${skippedCount} skipped, ${totalFetched} loaded in total)`;
          } else if (totalFetched > 0) {
            detailMessage = `${totalFetched} transactions were loaded for ${this.clientName()}, but none were saved`;
          } else {
            detailMessage = `No transactions were found for ${this.clientName()}`;
          }

          if (response.status === 'partial') {
            detailMessage += ` Part of the pull succeeded, but ${errorCount} source(s) or stage(s) failed. Error details are shown in the dialog.`;
          }

          const severity = response.status === 'failed'
            ? 'error'
            : response.status === 'partial'
              ? 'warn'
              : savedCount > 0
                ? 'success'
                : 'info';
          const summary = response.status === 'failed'
            ? 'Pull failed'
            : response.status === 'partial'
              ? 'Pull completed partially'
              : savedCount > 0
                ? 'Success'
                : 'Information';
          
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


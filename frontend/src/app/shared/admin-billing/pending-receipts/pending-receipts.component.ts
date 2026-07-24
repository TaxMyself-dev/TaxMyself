import { Component, DestroyRef, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { AdminBillingService, PendingReceiptFailure } from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes } from 'src/app/shared/enums';

@Component({
  selector: 'app-pending-receipts',
  standalone: true,
  templateUrl: './pending-receipts.component.html',
  styleUrls: ['./pending-receipts.component.scss'],
  imports: [CommonModule, ConfirmDialogModule, GenericTableComponent, ButtonComponent],
  providers: [DatePipe],
})
export class PendingReceiptsComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datePipe = inject(DatePipe);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly buttonSize = ButtonSize;

  failures = signal<PendingReceiptFailure[]>([]);
  isLoading = signal(false);
  /** billingEventId currently being generated, or null — disables the action
   *  across all rows while any one generation is in flight. */
  generatingEventId = signal<number | null>(null);

  readonly columnsTitle: IColumnDataTable<string, string>[] = [
    { name: 'userName',    value: 'משתמש',       type: FormTypes.TEXT },
    { name: 'userEmail',   value: 'אימייל',       type: FormTypes.TEXT },
    { name: 'planName',    value: 'תוכנית',       type: FormTypes.TEXT },
    { name: 'eventType',   value: 'סוג אירוע',    type: FormTypes.TEXT },
    { name: 'amount',      value: 'סכום',         type: FormTypes.TEXT },
    { name: 'dealNumber',  value: 'מספר עסקה',    type: FormTypes.TEXT },
    { name: 'createdAt',   value: 'תאריך חיוב',   type: FormTypes.DATE },
  ];

  readonly rowActions: ITableRowAction[] = [
    {
      name: 'generate',
      icon: 'pi pi-file-check',
      title: 'הפק קבלה',
      alwaysShow: true,
      isLoading: () => this.generatingEventId() !== null,
      action: (_: any, row: IRowDataTable) => this.confirmGenerate(row),
    },
  ];

  readonly tableRows = computed<IRowDataTable[]>(() =>
    this.failures().map(f => ({
      billingEventId: f.billingEventId,
      userName:       f.userName ?? '—',
      userEmail:      f.userEmail ?? '—',
      planName:       f.planName ?? '—',
      eventType:      f.eventType,
      amount:         this.formatAmount(f.amountAgorot),
      dealNumber:     f.cardcomDealNumber ?? '—',
      createdAt:      f.createdAt,
    }))
  );

  ngOnInit(): void {
    this.loadFailures();
  }

  loadFailures(): void {
    this.isLoading.set(true);
    this.adminBillingService.getPendingReceiptFailures()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: failures => this.failures.set(failures),
        error: () => {},
      });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return this.datePipe.transform(value, 'dd/MM/yyyy HH:mm') ?? '—';
  }

  formatAmount(agorot: number | null | undefined): string {
    if (agorot == null) return '—';
    return `₪${(agorot / 100).toFixed(2)}`;
  }

  confirmGenerate(row: IRowDataTable): void {
    const billingEventId = row['billingEventId'] as number;
    this.confirmationService.confirm({
      header: 'הפקת קבלה ידנית',
      message:
        'האם אתה בטוח שברצונך להפיק קבלה ידנית עבור תשלום זה?<br><br>' +
        'הפעולה תיצור מסמך קבלה, תעלה אותו ל-Firebase, ותשלח אותו במייל ללקוח — ' +
        'ותשחרר את המנוי לביצוע תשלומים נוספים.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'אישור',
      rejectLabel: 'ביטול',
      accept: () => this.runGenerate(billingEventId),
    });
  }

  private runGenerate(billingEventId: number): void {
    this.generatingEventId.set(billingEventId);
    this.adminBillingService.generateReceiptForEvent(billingEventId)
      .pipe(
        finalize(() => this.generatingEventId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: result => {
          this.messageService.add({
            key: 'br',
            severity: 'success',
            summary: 'הצלחה',
            detail: `הקבלה הופקה בהצלחה (מספר מסמך ${result.docNumber})`,
            life: 5000,
          });
          this.loadFailures();
        },
        error: err => {
          this.messageService.add({
            key: 'br',
            severity: 'error',
            summary: 'שגיאה',
            detail: err?.error?.message ?? 'שגיאה בהפקת הקבלה',
            life: 5000,
          });
        },
      });
  }
}

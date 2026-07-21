import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ChangePaymentMethodDialogComponent } from 'src/app/components/change-payment-method-dialog/change-payment-method-dialog.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { FilesService } from 'src/app/services/files.service';
import {
  BillingStateService,
  PaymentHistoryRow,
} from 'src/app/services/billing-state.service';
import {
  IColumnDataTable,
  IMobileCardConfig,
  IRowDataTable,
  ITableRowAction,
} from 'src/app/shared/interface';

/** Hebrew labels for each subscription status. */
const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'תקופת ניסיון',
  ACTIVE: 'פעיל',
  PAST_DUE: 'בפיגור תשלום',
  CANCELED: 'בוטל',
  TRIAL_EXPIRED: 'תקופת הניסיון הסתיימה',
};

@Component({
  selector: 'app-my-subscription-tab',
  standalone: true,
  imports: [
    CommonModule,
    GenericTableComponent,
    ButtonComponent,
    ChangePaymentMethodDialogComponent,
  ],
  templateUrl: './my-subscription-tab.component.html',
  styleUrls: ['./my-subscription-tab.component.scss'],
})
export class MySubscriptionTabComponent implements OnInit {
  private readonly billingStateService = inject(BillingStateService);
  private readonly filesService = inject(FilesService);
  private readonly messageService = inject(MessageService);

  readonly buttonColor = ButtonColor;
  readonly buttonSize = ButtonSize;

  /** Backend billing state (status card + payment-method card). */
  readonly billingState = this.billingStateService.billingState;
  readonly billingLoading = this.billingStateService.isLoading;

  readonly paymentHistory = signal<PaymentHistoryRow[]>([]);
  readonly historyLoading = signal(false);
  /** eventId whose receipt download is in flight (disables that row's button). */
  readonly downloadingEventId = signal<number | null>(null);
  /** True while the change-payment-method request is in flight (before redirect). */
  readonly changingPaymentMethod = signal(false);
  /** Open Fields dialog visibility (feature-flagged embedded flow). */
  readonly changePmDialogOpen = signal(false);

  /**
   * Whether replacing the saved card is allowed — only for ACTIVE / PAST_DUE
   * subscriptions (a saved card exists to replace). Mirrors the backend rule.
   */
  readonly canChangePaymentMethod = computed(() => {
    const s = this.status();
    return s === 'ACTIVE' || s === 'PAST_DUE';
  });

  // ─── Status card view model ─────────────────────────────────────────────────

  readonly status = computed(() => this.billingState()?.subscription?.status ?? null);
  readonly statusLabel = computed(() => {
    const s = this.status();
    return s ? (STATUS_LABELS[s] ?? s) : '—';
  });

  /** Current plan name, shown inside the status card. Falls back while no plan (trial). */
  readonly planNameLabel = computed(() => this.billingState()?.plan?.name ?? '—');

  readonly billingBusinessTypeLabel = computed(() => {
    switch (this.billingState()?.billingBusinessType) {
      case 'LICENSED':
        return 'עוסק מורשה';
      case 'EXEMPT':
        return 'עוסק פטור';
      default:
        return '—';
    }
  });

  readonly monthlyPriceLabel = computed(() => {
    const agorot = this.billingState()?.effectiveMonthlyPriceBeforeVatAgorot;
    return agorot != null ? `${formatShekels(agorot)} ₪ לחודש (לפני מע״מ)` : '—';
  });

  readonly nextBillingDateLabel = computed(() =>
    formatDate(this.billingState()?.subscription?.nextBillingDate),
  );

  readonly isCanceled = computed(() => this.status() === 'CANCELED');
  readonly activeUntilLabel = computed(() =>
    formatDate(this.billingState()?.subscription?.currentPeriodEnd),
  );

  /** Active discount, shown only while it is in effect. */
  readonly activeDiscount = computed(() => {
    const discount = this.billingState()?.discount;
    return discount && discount.isActiveNow ? discount : null;
  });

  readonly discountValueLabel = computed(() => {
    const d = this.activeDiscount();
    if (!d) return '';
    return d.kind === 'AMOUNT' && d.amountAgorot != null
      ? `${formatShekels(d.amountAgorot)} ₪`
      : `${d.percent ?? 0}%`;
  });

  readonly discountRangeLabel = computed(() => {
    const d = this.activeDiscount();
    if (!d || (!d.startDate && !d.endDate)) return '';
    return `${formatDate(d.startDate)} – ${formatDate(d.endDate)}`;
  });

  // ─── Payment-method card view model ─────────────────────────────────────────

  readonly paymentMethod = computed(() => this.billingState()?.paymentMethod ?? null);
  readonly cardExpiryLabel = computed(() => {
    const pm = this.paymentMethod();
    if (!pm?.expiryMonth || !pm?.expiryYear) return '';
    const mm = String(pm.expiryMonth).padStart(2, '0');
    const yy = String(pm.expiryYear).slice(-2);
    return `${mm}/${yy}`;
  });

  // ─── Payment-history table config ───────────────────────────────────────────

  readonly historyColumns: IColumnDataTable<string, string>[] = [
    { name: 'date', value: 'תאריך' },
    { name: 'planName', value: 'תוכנית' },
    { name: 'amount', value: 'סכום' },
    { name: 'statusLabel', value: 'סטטוס' },
  ];

  readonly historyRows = computed<IRowDataTable[]>(() =>
    this.paymentHistory().map((row) => ({
      id: row.eventId,
      eventId: row.eventId,
      date: formatDate(row.date),
      planName: row.planName ?? 'תוכנית לא ידועה',
      amount: row.amountAgorot != null ? `${formatShekels(row.amountAgorot)} ₪` : '—',
      statusLabel: row.status === 'SUCCESS' ? 'שולם' : 'נכשל',
      receiptAvailable: row.receiptAvailable,
      canRetry: row.canRetry,
    })),
  );

  readonly historyMobileCardConfig: IMobileCardConfig = {
    primaryFields: ['planName'],
    highlightedField: 'amount',
    dateField: 'date',
    highlightedValueFormat: 'plain',
  };

  readonly historyRowActions: ITableRowAction[] = [
    {
      // Always shown (no showWhen). If the receipt is unavailable the backend
      // returns 404 and we surface a friendly toast — hiding the button would
      // look like a UI bug (see downloadReceipt).
      name: 'downloadReceipt',
      icon: 'pi pi-download',
      title: 'הורד קבלה',
      isLoading: () => this.downloadingEventId() !== null,
      action: (_, row) => {
        if (row) this.downloadReceipt(Number(row['eventId']));
      },
    },
    {
      // Phase 1 placeholder: only rendered for retryable rows (canRetry from
      // backend event type). Real retry-payment flow is wired in Phase 2.
      name: 'retryPayment',
      icon: 'pi pi-refresh',
      title: 'נסה לחייב שוב',
      showWhen: (row) => !!row['canRetry'],
      action: () => {
        // TODO(Phase 2): trigger the real retry-payment flow.
        this.messageService.add({
          severity: 'info',
          summary: 'בקרוב',
          detail: 'אפשרות התשלום החוזר תתווסף בקרוב.',
          life: 4000,
          key: 'br',
        });
      },
    },
  ];

  ngOnInit(): void {
    // Billing state is normally already loaded app-wide; this is a no-op if so.
    this.billingStateService.loadBillingState();
    this.loadPaymentHistory();
  }

  private loadPaymentHistory(): void {
    this.historyLoading.set(true);
    this.billingStateService
      .getPaymentHistory()
      .then((rows) => this.paymentHistory.set(rows ?? []))
      .catch(() => this.paymentHistory.set([]))
      .finally(() => this.historyLoading.set(false));
  }

  /**
   * Starts the change-payment-method flow by opening the embedded Open Fields
   * dialog. The dialog owns everything from here: it creates the LowProfile,
   * hosts the CardCom iframes, and waits for the webhook via billing/me polling.
   * This action never redirects the page.
   */
  changePaymentMethod(): void {
    if (this.changingPaymentMethod() || !this.canChangePaymentMethod()) return;

    this.changePmDialogOpen.set(true);
  }

  private downloadReceipt(eventId: number): void {
    if (this.downloadingEventId() !== null) return;
    this.downloadingEventId.set(eventId);
    this.billingStateService
      .getReceiptBlob(eventId)
      .then((blob) => this.filesService.downloadFile(`קבלה-${eventId}.pdf`, blob))
      .catch((err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail:
            err?.status === 404
              ? 'לא קיים מסמך עבור תשלום זה'
              : 'לא ניתן להוריד את הקבלה. נסה שוב מאוחר יותר.',
          life: 4000,
          key: 'br',
        }),
      )
      .finally(() => this.downloadingEventId.set(null));
  }
}

/** agorot → shekels display string (no trailing .00 for whole shekels). */
function formatShekels(agorot: number): string {
  const shekels = agorot / 100;
  return shekels % 1 === 0
    ? shekels.toLocaleString('he-IL')
    : shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO/date string → dd/mm/yyyy, or '—' when empty/invalid. */
function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

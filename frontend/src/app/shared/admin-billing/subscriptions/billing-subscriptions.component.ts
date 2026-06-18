import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { DrawerModule } from 'primeng/drawer';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import {
  AdminBillingService,
  AdminSubscription,
  RenewalOutcome,
  RenewalResult,
  UpdateSubscriptionDiscountPayload,
} from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';

export type DiscountKind = 'NONE' | 'PERCENT' | 'AMOUNT';

/** ISelectItem format required by app-input-select (name/value, not label/value). */
const DISCOUNT_KIND_OPTIONS: ISelectItem[] = [
  { name: 'ללא הנחה',     value: 'NONE' },
  { name: 'אחוז הנחה',    value: 'PERCENT' },
  { name: 'סכום קבוע (₪)', value: 'AMOUNT' },
];

/** When both dates are set, start must be <= end. Attached to discountEndDate. */
function discountDateRangeValidator(control: AbstractControl): ValidationErrors | null {
  const end = control.value;
  const start = control.parent?.get('discountStartDate')?.value;
  if (start && end && new Date(start) > new Date(end)) {
    return { dateRange: true };
  }
  return null;
}

export const STATUS_LABELS: Record<string, string> = {
  TRIAL:         'ניסיון',
  ACTIVE:        'פעיל',
  PAST_DUE:      'בפיגור',
  TRIAL_EXPIRED: 'ניסיון פג',
  CANCELED:      'בוטל',
};

@Component({
  selector: 'app-billing-subscriptions',
  standalone: true,
  templateUrl: './billing-subscriptions.component.html',
  styleUrls: ['./billing-subscriptions.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DrawerModule,
    ConfirmDialogModule,
    GenericTableComponent,
    ButtonComponent,
    InputTextComponent,
    InputDateComponent,
    InputSelectComponent,
  ],
  providers: [DatePipe],
})
export class BillingSubscriptionsComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datePipe = inject(DatePipe);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly statusLabels = STATUS_LABELS;
  readonly discountKindOptions = DISCOUNT_KIND_OPTIONS;

  // Angular 19: signal-based view query — no @ViewChild, no ngAfterViewInit
  private readonly statusTpl = viewChild<TemplateRef<any>>('statusTpl');

  subscriptions = signal<AdminSubscription[]>([]);
  isLoading = signal(false);
  selectedSub = signal<AdminSubscription | null>(null);
  showDrawer = signal(false);
  savingDiscount = signal(false);
  /** subscriptionId currently being charged, or null. Mirrors the isClearingCache
   *  pattern used elsewhere — disables the "charge now" action across all rows
   *  while any one charge is in flight. */
  chargingSubscriptionId = signal<number | null>(null);

  readonly discountForm = this.fb.group({
    discountKind:          ['NONE' as DiscountKind],
    discountPercent:       [null as number | null, [Validators.min(0), Validators.max(100)]],
    discountAmountShekels: [null as number | null, [Validators.min(0)]],
    discountStartDate:     [null as Date | null],
    discountEndDate:       [null as Date | null, [discountDateRangeValidator]],
  });

  constructor() {
    this.discountForm.get('discountKind')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind: DiscountKind | null) => {
        if (kind !== 'PERCENT') this.discountForm.get('discountPercent')?.setValue(null);
        if (kind !== 'AMOUNT') this.discountForm.get('discountAmountShekels')?.setValue(null);
      });

    this.discountForm.get('discountStartDate')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.discountForm.get('discountEndDate')?.updateValueAndValidity());
  }

  // Columns re-derived automatically when statusTpl signal updates after view init
  readonly columnsTitle = computed<IColumnDataTable<string, string>[]>(() => [
    { name: 'userName',        value: 'משתמש',       type: FormTypes.TEXT },
    { name: 'userEmail',       value: 'אימייל',       type: FormTypes.TEXT },
    { name: 'businessName',    value: 'עסק',          type: FormTypes.TEXT },
    { name: 'status',          value: 'סטטוס',        cellTemplate: this.statusTpl() },
    { name: 'planName',        value: 'תוכנית',       type: FormTypes.TEXT },
    { name: 'trialEnd',        value: 'סיום ניסיון',  type: FormTypes.DATE },
    { name: 'currentPeriodEnd', value: 'תום תקופה',   type: FormTypes.DATE },
    { name: 'cardTokenExists', value: 'כרטיס',        cellRenderer: ICellRenderer.CHECKBOX },
    { name: 'createdAt',       value: 'נוצר',         type: FormTypes.DATE },
  ]);

  readonly rowActions: ITableRowAction[] = [
    {
      name: 'view',
      icon: 'pi pi-eye',
      title: 'פרטים',
      action: (_: any, row: IRowDataTable) => this.openDetails(row['subscriptionId'] as number),
    },
    {
      name: 'chargeNow',
      icon: 'pi pi-credit-card',
      title: 'חיוב ידני',
      alwaysShow: true,
      isLoading: () => this.chargingSubscriptionId() !== null,
      action: (_: any, row: IRowDataTable) => this.confirmChargeNow(row),
    },
  ];

  readonly tableRows = computed<IRowDataTable[]>(() =>
    this.subscriptions().map(s => ({
      subscriptionId:   s.subscriptionId,
      userName:         s.userName ?? '—',
      userEmail:        s.userEmail ?? '—',
      businessName:     s.businessName ?? '—',
      status:           s.status,
      planName:         s.planName ?? 'ללא תוכנית',
      trialEnd:         s.trialEnd,
      currentPeriodEnd: s.currentPeriodEnd,
      cardTokenExists:  s.cardTokenExists,
      createdAt:        s.createdAt,
    }))
  );

  ngOnInit(): void {
    this.loadSubscriptions();
  }

  loadSubscriptions(): void {
    this.isLoading.set(true);
    this.adminBillingService.getSubscriptions()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: subs => this.subscriptions.set(subs),
        error: () => {},
      });
  }

  openDetails(subscriptionId: number): void {
    const sub = this.subscriptions().find(s => s.subscriptionId === subscriptionId);
    if (!sub) return;
    this.selectedSub.set(sub);
    this.resetDiscountForm(sub);
    this.showDrawer.set(true);
  }

  onDrawerHide(): void {
    this.selectedSub.set(null);
    this.showDrawer.set(false);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return this.datePipe.transform(value, 'dd/MM/yyyy') ?? '—';
  }

  formatAmount(agorot: number | null | undefined): string {
    if (agorot == null) return '—';
    return `₪${(agorot / 100).toFixed(2)}`;
  }

  // ─── Discount editing ──────────────────────────────────────────────────────

  private resetDiscountForm(sub: AdminSubscription): void {
    const discountKind: DiscountKind =
      sub.discountPercent != null ? 'PERCENT' :
      sub.discountAmountAgorot != null ? 'AMOUNT' : 'NONE';

    this.discountForm.reset({
      discountKind,
      discountPercent:       sub.discountPercent,
      discountAmountShekels: sub.discountAmountAgorot != null ? sub.discountAmountAgorot / 100 : null,
      discountStartDate:     sub.discountStartDate ? new Date(sub.discountStartDate) : null,
      discountEndDate:       sub.discountEndDate ? new Date(sub.discountEndDate) : null,
    });
  }

  saveDiscount(): void {
    if (this.discountForm.invalid) {
      this.discountForm.markAllAsTouched();
      return;
    }
    const sub = this.selectedSub();
    if (!sub) return;

    const raw = this.discountForm.getRawValue();
    // Discount dates are business date ranges (date-only), not timestamps — format
    // using local date parts to avoid the UTC-shift toISOString() would introduce.
    const toLocalDateString = (d: Date | null): string | null => {
      if (!d) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    // app-input-text type="number" yields string values (no NumberValueAccessor match), so coerce explicitly.
    const toNumber = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };
    const percent = toNumber(raw.discountPercent);
    const amountShekels = toNumber(raw.discountAmountShekels);
    const payload: UpdateSubscriptionDiscountPayload = {
      discountPercent: raw.discountKind === 'PERCENT' ? percent : null,
      discountAmountAgorot: raw.discountKind === 'AMOUNT' && amountShekels != null
        ? Math.round(amountShekels * 100)
        : null,
      discountStartDate: toLocalDateString(raw.discountStartDate),
      discountEndDate: toLocalDateString(raw.discountEndDate),
    };

    this.savingDiscount.set(true);
    this.adminBillingService.updateSubscriptionDiscount(sub.subscriptionId, payload)
      .pipe(
        finalize(() => this.savingDiscount.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: updated => {
          const merge = (s: AdminSubscription): AdminSubscription => ({
            ...s,
            discountPercent: updated.discountPercent,
            discountAmountAgorot: updated.discountAmountAgorot,
            discountStartDate: updated.discountStartDate,
            discountEndDate: updated.discountEndDate,
          });
          this.subscriptions.update(subs =>
            subs.map(s => s.subscriptionId === updated.subscriptionId ? merge(s) : s)
          );
          this.selectedSub.update(s => s ? merge(s) : s);
          this.messageService.add({
            key: 'br',
            severity: 'success',
            summary: 'הצלחה',
            detail: 'הנחת המנוי עודכנה בהצלחה',
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            key: 'br',
            severity: 'error',
            summary: 'שגיאה',
            detail: 'שגיאה בעדכון הנחת המנוי',
            life: 4000,
          });
        },
      });
  }

  // ─── Manual renewal charge ─────────────────────────────────────────────────

  confirmChargeNow(row: IRowDataTable): void {
    const subscriptionId = row['subscriptionId'] as number;
    this.confirmationService.confirm({
      header: 'חיוב מנוי',
      message:
        'האם אתה בטוח שברצונך לבצע חיוב ידני עבור מנוי זה?<br><br>' +
        'הפעולה תנסה לחייב את אמצעי התשלום השמור של הלקוח באמצעות CardCom.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'אישור',
      rejectLabel: 'ביטול',
      accept: () => this.runChargeNow(subscriptionId),
    });
  }

  private runChargeNow(subscriptionId: number): void {
    this.chargingSubscriptionId.set(subscriptionId);
    this.adminBillingService.triggerSubscriptionRenewal(subscriptionId)
      .pipe(
        finalize(() => this.chargingSubscriptionId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: result => {
          const { severity, summary, detail } = this.describeRenewalResult(result);
          this.messageService.add({ key: 'br', severity, summary, detail, life: 5000 });
          this.loadSubscriptions();
        },
        error: err => {
          this.messageService.add({
            key: 'br',
            severity: 'error',
            summary: 'שגיאה',
            detail: `מנוי #${subscriptionId}: ${err?.error?.message ?? 'שגיאה בביצוע החיוב הידני'}`,
            life: 5000,
          });
        },
      });
  }

  /** Maps the backend's RenewalResult outcome to a toast — the endpoint always
   *  resolves with HTTP 200, so the real success/failure signal is `outcome`. */
  private describeRenewalResult(result: RenewalResult): {
    severity: 'success' | 'warn' | 'info' | 'error';
    summary: string;
    detail: string;
  } {
    const id = result.subscriptionId;
    const outcomeMessages: Record<RenewalOutcome, { severity: 'success' | 'warn' | 'info' | 'error'; summary: string; detail: string }> = {
      success: {
        severity: 'success',
        summary: 'הצלחה',
        detail: `מנוי #${id} חויב בהצלחה`,
      },
      retry_scheduled: {
        severity: 'warn',
        summary: 'החיוב נכשל',
        detail: `מנוי #${id}: החיוב נכשל, ינוסה חיוב חוזר במועד הבא`,
      },
      past_due: {
        severity: 'warn',
        summary: 'המנוי הועבר לפיגור',
        detail: `מנוי #${id}: כל ניסיונות החיוב נכשלו, המנוי הועבר לסטטוס "בפיגור"`,
      },
      skipped: {
        severity: 'info',
        summary: 'לא בוצע חיוב',
        detail: `מנוי #${id}: ${result.message ?? 'המנוי אינו זכאי לחיוב כרגע'}`,
      },
      error: {
        severity: 'error',
        summary: 'שגיאה',
        detail: `מנוי #${id}: ${result.message ?? 'שגיאה בביצוע החיוב הידני'}`,
      },
    };
    return outcomeMessages[result.outcome];
  }
}

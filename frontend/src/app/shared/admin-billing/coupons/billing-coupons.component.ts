import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { ButtonSize } from 'src/app/components/button/button.enum';
import {
  AdminBillingService,
  AdminCoupon,
  AdminPlan,
  CreateCouponPayload,
  DiscountType,
  DurationType,
} from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ISelectItem } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';

const DISCOUNT_TYPE_OPTIONS: ISelectItem[] = [
  { name: 'אחוז הנחה',           value: 'PERCENT' },
  { name: 'הנחה קבועה (₪)',     value: 'FIXED_AMOUNT' },
  { name: 'מחיר סופי קבוע (₪)', value: 'FIXED_PRICE' },
];

const DURATION_TYPE_OPTIONS: ISelectItem[] = [
  { name: 'פעם אחת', value: 'ONCE' },
  { name: 'חוזר',    value: 'REPEATING' },
  { name: 'לצמיתות', value: 'FOREVER' },
];

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  PERCENT:      'אחוז הנחה',
  FIXED_AMOUNT: 'הנחה קבועה',
  FIXED_PRICE:  'מחיר קבוע',
};

const DURATION_TYPE_LABELS: Record<string, string> = {
  ONCE:      'פעם אחת',
  REPEATING: 'חוזר',
  FOREVER:   'לצמיתות',
};

@Component({
  selector: 'app-billing-coupons',
  standalone: true,
  templateUrl: './billing-coupons.component.html',
  styleUrls: ['./billing-coupons.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    GenericTableComponent,
    ButtonComponent,
    InputTextComponent,
    InputSelectComponent,
    InputDateComponent,
    DialogModule,
    ConfirmDialogModule,
    ToastModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    MultiSelectModule,
    TextareaModule,
  ],
  providers: [ConfirmationService, MessageService, DatePipe],
})
export class BillingCouponsComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly buttonSize = ButtonSize;
  readonly discountTypeOptions = DISCOUNT_TYPE_OPTIONS;
  readonly durationTypeOptions = DURATION_TYPE_OPTIONS;

  coupons = signal<AdminCoupon[]>([]);
  plans = signal<AdminPlan[]>([]);
  isLoading = signal(false);
  saving = signal(false);
  showDialog = signal(false);
  editingId = signal<number | null>(null);

  planOptions = computed(() =>
    this.plans().map(p => ({ label: p.name, value: p.id }))
  );

  couponForm = this.fb.group({
    code:                   ['', [Validators.required, Validators.maxLength(100)]],
    name:                   ['', [Validators.required, Validators.maxLength(255)]],
    description:            [null as string | null],
    discountType:           ['PERCENT' as DiscountType, Validators.required],
    discountPercent:        [null as number | null],
    discountValueShekels:   [null as number | null],
    durationType:           ['ONCE' as DurationType, Validators.required],
    durationMonths:         [null as number | null],
    startsAt:               [null as Date | null],
    endsAt:                 [null as Date | null],
    maxRedemptions:         [null as number | null],
    maxRedemptionsPerUser:  [1, [Validators.required, Validators.min(1)]],
    isActive:               [true],
    appliesToPlanIds:       [[] as number[]],
  });

  get selectedDiscountType(): DiscountType {
    return this.couponForm.get('discountType')?.value as DiscountType ?? 'PERCENT';
  }

  get selectedDurationType(): DurationType {
    return this.couponForm.get('durationType')?.value as DurationType ?? 'ONCE';
  }

  // ─── Table configuration ───────────────────────────────────────────────────

  readonly columnsTitle: IColumnDataTable<string, string>[] = [
    { name: 'code',          value: 'קוד קופון',    type: FormTypes.TEXT },
    { name: 'name',          value: 'שם',           type: FormTypes.TEXT },
    { name: 'discountLabel', value: 'סוג הנחה',     type: FormTypes.TEXT },
    { name: 'discountValue', value: 'ערך הנחה',     type: FormTypes.TEXT },
    { name: 'durationLabel', value: 'משך',          type: FormTypes.TEXT },
    { name: 'plansCount',    value: 'תוכניות',      type: FormTypes.TEXT },
    { name: 'perUser',       value: 'מקס׳ למשתמש', type: FormTypes.NUMBER },
    { name: 'redemptions',   value: 'מימושים',      type: FormTypes.TEXT },
    { name: 'isActive',      value: 'פעיל',         cellRenderer: ICellRenderer.CHECKBOX },
  ];

  readonly rowActions: ITableRowAction[] = [
    {
      name: 'edit',
      icon: 'pi pi-pencil',
      title: 'עריכה',
      action: (_: any, row: IRowDataTable) => this.openEdit(row['id'] as number),
    },
    {
      name: 'deactivate',
      icon: 'pi pi-ban',
      title: 'נטרול',
      showWhen: (row: IRowDataTable) => row['isActive'] === true,
      action: (_: any, row: IRowDataTable) => this.confirmDeactivate(row),
    },
    {
      name: 'activate',
      icon: 'pi pi-check',
      title: 'הפעלה',
      showWhen: (row: IRowDataTable) => row['isActive'] === false,
      action: (_: any, row: IRowDataTable) => this.confirmActivate(row),
    },
  ];

  tableRows = computed<IRowDataTable[]>(() =>
    this.coupons().map(c => ({
      id:            c.id,
      code:          c.code,
      name:          c.name,
      discountLabel: DISCOUNT_TYPE_LABELS[c.discountType] ?? c.discountType,
      discountValue: this.formatDiscountValue(c),
      durationLabel: this.formatDuration(c),
      plansCount:    c.appliesToPlanIds.length === 0
                       ? 'כל התוכניות'
                       : String(c.appliesToPlanIds.length),
      perUser:       c.maxRedemptionsPerUser,
      redemptions:   c.maxRedemptions != null
                       ? `${c.currentRedemptions} / ${c.maxRedemptions}`
                       : String(c.currentRedemptions),
      isActive:      c.isActive,
    }))
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.isLoading.set(true);
    forkJoin({
      coupons: this.adminBillingService.getCoupons(),
      plans: this.adminBillingService.getPlans(),
    }).pipe(
      finalize(() => this.isLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ coupons, plans }) => {
        this.coupons.set(coupons);
        this.plans.set(plans);
      },
      error: () => this.showError('שגיאה בטעינת נתונים'),
    });
  }

  // ─── Dialog helpers ────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.couponForm.reset({
      code: '',
      name: '',
      description: null,
      discountType: 'PERCENT',
      discountPercent: null,
      discountValueShekels: null,
      durationType: 'ONCE',
      durationMonths: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      maxRedemptionsPerUser: 1,
      isActive: true,
      appliesToPlanIds: [],
    });
    this.showDialog.set(true);
  }

  openEdit(id: number): void {
    const coupon = this.coupons().find(c => c.id === id);
    if (!coupon) return;
    this.editingId.set(id);
    this.couponForm.reset({
      code:                  coupon.code,
      name:                  coupon.name,
      description:           coupon.description,
      discountType:          coupon.discountType,
      discountPercent:       coupon.discountPercent,
      discountValueShekels:  coupon.discountValueAgorot != null
                               ? coupon.discountValueAgorot / 100
                               : null,
      durationType:          coupon.durationType,
      durationMonths:        coupon.durationMonths,
      startsAt:              coupon.startsAt ? new Date(coupon.startsAt) : null,
      endsAt:                coupon.endsAt ? new Date(coupon.endsAt) : null,
      maxRedemptions:        coupon.maxRedemptions,
      maxRedemptionsPerUser: coupon.maxRedemptionsPerUser,
      isActive:              coupon.isActive,
      appliesToPlanIds:      coupon.appliesToPlanIds,
    });
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
  }

  onHide(): void {
    this.editingId.set(null);
    this.showDialog.set(false);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  saveCoupon(): void {
    if (this.couponForm.invalid) {
      this.couponForm.markAllAsTouched();
      return;
    }
    const raw = this.couponForm.getRawValue();
    const discountType = raw.discountType as DiscountType;

    const payload: CreateCouponPayload = {
      code:            raw.code!,
      name:            raw.name!,
      description:     raw.description ?? null,
      discountType,
      discountPercent: discountType === 'PERCENT'
                         ? (raw.discountPercent ?? null)
                         : null,
      discountValueAgorot: discountType !== 'PERCENT'
                             ? (raw.discountValueShekels != null
                                  ? Math.round(raw.discountValueShekels * 100)
                                  : null)
                             : null,
      durationType:         raw.durationType as DurationType,
      durationMonths:       raw.durationType === 'REPEATING'
                              ? (raw.durationMonths ?? null)
                              : null,
      startsAt:             raw.startsAt
                              ? (raw.startsAt as Date).toISOString()
                              : null,
      endsAt:               raw.endsAt
                              ? (raw.endsAt as Date).toISOString()
                              : null,
      maxRedemptions:       raw.maxRedemptions ?? null,
      maxRedemptionsPerUser: raw.maxRedemptionsPerUser ?? 1,
      isActive:             raw.isActive ?? true,
      appliesToPlanIds:     raw.appliesToPlanIds ?? [],
    };

    this.saving.set(true);
    const id = this.editingId();
    const request$ = id
      ? this.adminBillingService.updateCoupon(id, payload)
      : this.adminBillingService.createCoupon(payload);

    request$.pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: id ? 'הקופון עודכן בהצלחה' : 'הקופון נוצר בהצלחה',
          life: 3000,
        });
        this.closeDialog();
        this.loadAll();
      },
      error: (err: HttpErrorResponse) => {
        const detail = err.status === 409
          ? (err.error?.message ?? 'קוד הקופון כבר קיים')
          : (id ? 'שגיאה בעדכון הקופון' : 'שגיאה ביצירת הקופון');
        this.showError(detail);
      },
    });
  }

  // ─── Activate / Deactivate ─────────────────────────────────────────────────

  confirmDeactivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם לנטרל את הקופון "${row['code']}"?`,
      header: 'אישור נטרול',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, נטרל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, false),
    });
  }

  confirmActivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם להפעיל מחדש את הקופון "${row['code']}"?`,
      header: 'אישור הפעלה',
      icon: 'pi pi-info-circle',
      acceptLabel: 'כן, הפעל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, true),
    });
  }

  private runActivation(id: number, activate: boolean): void {
    const request$ = activate
      ? this.adminBillingService.activateCoupon(id)
      : this.adminBillingService.deactivateCoupon(id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: activate ? 'הקופון הופעל מחדש' : 'הקופון נוטרל',
          life: 3000,
        });
        this.loadAll();
      },
      error: () => this.showError(activate ? 'שגיאה בהפעלת הקופון' : 'שגיאה בנטרול הקופון'),
    });
  }

  // ─── Display helpers ───────────────────────────────────────────────────────

  private formatDiscountValue(c: AdminCoupon): string {
    switch (c.discountType) {
      case 'PERCENT':      return `${c.discountPercent ?? 0}%`;
      case 'FIXED_AMOUNT': return `-₪${((c.discountValueAgorot ?? 0) / 100).toFixed(2)}`;
      case 'FIXED_PRICE':  return `₪${((c.discountValueAgorot ?? 0) / 100).toFixed(2)} קבוע`;
      default:             return '—';
    }
  }

  private formatDuration(c: AdminCoupon): string {
    const label = DURATION_TYPE_LABELS[c.durationType] ?? c.durationType;
    return c.durationType === 'REPEATING' && c.durationMonths
      ? `${label} (${c.durationMonths} חודשים)`
      : label;
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 4000 });
  }

  get isEditMode(): boolean { return this.editingId() !== null; }

  fieldInvalid(name: string): boolean {
    const ctrl = this.couponForm.get(name);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}

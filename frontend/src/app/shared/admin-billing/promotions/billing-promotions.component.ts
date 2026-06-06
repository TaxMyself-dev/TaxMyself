import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
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
  AdminPlan,
  AdminPromotion,
  CreatePromotionPayload,
  DiscountType,
  DurationType,
} from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ISelectItem } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';

/** ISelectItem format required by app-input-select (name/value, not label/value). */
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
  ONCE:       'פעם אחת',
  REPEATING:  'חוזר',
  FOREVER:    'לצמיתות',
};

@Component({
  selector: 'app-billing-promotions',
  standalone: true,
  templateUrl: './billing-promotions.component.html',
  styleUrls: ['./billing-promotions.component.scss'],
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
    InputNumberModule,
    CheckboxModule,
    MultiSelectModule,
    TextareaModule,
  ],
  providers: [ConfirmationService, MessageService, DatePipe],
})
export class BillingPromotionsComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly datePipe = inject(DatePipe);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly buttonSize = ButtonSize;
  readonly discountTypeOptions = DISCOUNT_TYPE_OPTIONS;
  readonly durationTypeOptions = DURATION_TYPE_OPTIONS;

  promotions = signal<AdminPromotion[]>([]);
  plans = signal<AdminPlan[]>([]);
  isLoading = signal(false);
  saving = signal(false);
  showDialog = signal(false);
  editingId = signal<number | null>(null);

  /** Plan options for the multi-select inside the dialog. */
  planOptions = computed(() =>
    this.plans().map(p => ({ label: p.name, value: p.id }))
  );

  promotionForm = this.fb.group({
    name:                   ['', [Validators.required, Validators.maxLength(255)]],
    description:            [null as string | null],
    discountType:           ['PERCENT' as DiscountType, Validators.required],
    discountPercent:        [null as number | null],
    discountValueShekels:   [null as number | null],
    durationType:           ['ONCE' as DurationType, Validators.required],
    durationMonths:         [null as number | null],
    startsAt:               [null as Date | null],
    endsAt:                 [null as Date | null],
    priority:               [0],
    maxRedemptions:         [null as number | null],
    isActive:               [true],
    appliesToPlanIds:       [[] as number[]],
  });

  // ─── Computed helpers ──────────────────────────────────────────────────────

  get selectedDiscountType(): DiscountType {
    return this.promotionForm.get('discountType')?.value as DiscountType ?? 'PERCENT';
  }

  get selectedDurationType(): DurationType {
    return this.promotionForm.get('durationType')?.value as DurationType ?? 'ONCE';
  }

  // ─── Table configuration ───────────────────────────────────────────────────

  readonly columnsTitle: IColumnDataTable<string, string>[] = [
    { name: 'name',           value: 'שם מבצע',      type: FormTypes.TEXT },
    { name: 'discountLabel',  value: 'סוג הנחה',     type: FormTypes.TEXT },
    { name: 'discountValue',  value: 'ערך הנחה',     type: FormTypes.TEXT },
    { name: 'durationLabel',  value: 'משך',          type: FormTypes.TEXT },
    { name: 'plansCount',     value: 'תוכניות',      type: FormTypes.NUMBER },
    { name: 'priority',       value: 'עדיפות',       type: FormTypes.NUMBER },
    { name: 'redemptions',    value: 'מימושים',      type: FormTypes.TEXT },
    { name: 'isActive',       value: 'פעיל',         cellRenderer: ICellRenderer.CHECKBOX },
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
    this.promotions().map(p => ({
      id:            p.id,
      name:          p.name,
      discountLabel: DISCOUNT_TYPE_LABELS[p.discountType] ?? p.discountType,
      discountValue: this.formatDiscountValue(p),
      durationLabel: this.formatDuration(p),
      plansCount:    p.appliesToPlanIds.length === 0
                       ? 'כל התוכניות'
                       : String(p.appliesToPlanIds.length),
      priority:      p.priority,
      redemptions:   p.maxRedemptions != null
                       ? `${p.currentRedemptions} / ${p.maxRedemptions}`
                       : String(p.currentRedemptions),
      isActive:      p.isActive,
    }))
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAll();
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  loadAll(): void {
    this.isLoading.set(true);
    forkJoin({
      promotions: this.adminBillingService.getPromotions(),
      plans: this.adminBillingService.getPlans(),
    }).pipe(
      finalize(() => this.isLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ promotions, plans }) => {
        this.promotions.set(promotions);
        this.plans.set(plans);
      },
      error: () => this.showError('שגיאה בטעינת נתונים'),
    });
  }

  // ─── Dialog helpers ────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.promotionForm.reset({
      name: '',
      description: null,
      discountType: 'PERCENT',
      discountPercent: null,
      discountValueShekels: null,
      durationType: 'ONCE',
      durationMonths: null,
      startsAt: null,
      endsAt: null,
      priority: 0,
      maxRedemptions: null,
      isActive: true,
      appliesToPlanIds: [],
    });
    this.showDialog.set(true);
  }

  openEdit(id: number): void {
    const promo = this.promotions().find(p => p.id === id);
    if (!promo) return;
    this.editingId.set(id);
    this.promotionForm.reset({
      name:                 promo.name,
      description:          promo.description,
      discountType:         promo.discountType,
      discountPercent:      promo.discountPercent,
      discountValueShekels: promo.discountValueAgorot != null
                              ? promo.discountValueAgorot / 100
                              : null,
      durationType:         promo.durationType,
      durationMonths:       promo.durationMonths,
      startsAt:             promo.startsAt ? new Date(promo.startsAt) : null,
      endsAt:               promo.endsAt ? new Date(promo.endsAt) : null,
      priority:             promo.priority,
      maxRedemptions:       promo.maxRedemptions,
      isActive:             promo.isActive,
      appliesToPlanIds:     promo.appliesToPlanIds,
    });
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
  }

  /** Called by (onHide) — resets dialog state after the panel finishes closing. */
  onHide(): void {
    this.editingId.set(null);
    this.showDialog.set(false);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  savePromotion(): void {
    if (this.promotionForm.invalid) {
      this.promotionForm.markAllAsTouched();
      return;
    }
    const raw = this.promotionForm.getRawValue();
    const discountType = raw.discountType as DiscountType;

    const payload: CreatePromotionPayload = {
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
      durationType:    raw.durationType as DurationType,
      durationMonths:  raw.durationType === 'REPEATING'
                         ? (raw.durationMonths ?? null)
                         : null,
      startsAt:        raw.startsAt
                         ? (raw.startsAt as Date).toISOString()
                         : null,
      endsAt:          raw.endsAt
                         ? (raw.endsAt as Date).toISOString()
                         : null,
      priority:        raw.priority ?? 0,
      maxRedemptions:  raw.maxRedemptions ?? null,
      isActive:        raw.isActive ?? true,
      appliesToPlanIds: raw.appliesToPlanIds ?? [],
    };

    this.saving.set(true);
    const id = this.editingId();
    const request$ = id
      ? this.adminBillingService.updatePromotion(id, payload)
      : this.adminBillingService.createPromotion(payload);

    request$.pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: id ? 'המבצע עודכן בהצלחה' : 'המבצע נוצר בהצלחה',
          life: 3000,
        });
        this.closeDialog();
        this.loadAll();
      },
      error: () => this.showError(id ? 'שגיאה בעדכון המבצע' : 'שגיאה ביצירת המבצע'),
    });
  }

  // ─── Activate / Deactivate ─────────────────────────────────────────────────

  confirmDeactivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם לנטרל את המבצע "${row['name']}"?`,
      header: 'אישור נטרול',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, נטרל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, false),
    });
  }

  confirmActivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם להפעיל מחדש את המבצע "${row['name']}"?`,
      header: 'אישור הפעלה',
      icon: 'pi pi-info-circle',
      acceptLabel: 'כן, הפעל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, true),
    });
  }

  private runActivation(id: number, activate: boolean): void {
    const request$ = activate
      ? this.adminBillingService.activatePromotion(id)
      : this.adminBillingService.deactivatePromotion(id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: activate ? 'המבצע הופעל מחדש' : 'המבצע נוטרל',
          life: 3000,
        });
        this.loadAll();
      },
      error: () => this.showError(activate ? 'שגיאה בהפעלת המבצע' : 'שגיאה בנטרול המבצע'),
    });
  }

  // ─── Display helpers ───────────────────────────────────────────────────────

  private formatDiscountValue(p: AdminPromotion): string {
    switch (p.discountType) {
      case 'PERCENT':      return `${p.discountPercent ?? 0}%`;
      case 'FIXED_AMOUNT': return `-₪${((p.discountValueAgorot ?? 0) / 100).toFixed(2)}`;
      case 'FIXED_PRICE':  return `₪${((p.discountValueAgorot ?? 0) / 100).toFixed(2)} קבוע`;
      default:             return '—';
    }
  }

  private formatDuration(p: AdminPromotion): string {
    const label = DURATION_TYPE_LABELS[p.durationType] ?? p.durationType;
    return p.durationType === 'REPEATING' && p.durationMonths
      ? `${label} (${p.durationMonths} חודשים)`
      : label;
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 4000 });
  }

  // ─── Form helpers ──────────────────────────────────────────────────────────

  get isEditMode(): boolean { return this.editingId() !== null; }

  fieldInvalid(name: string): boolean {
    const ctrl = this.promotionForm.get(name);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}

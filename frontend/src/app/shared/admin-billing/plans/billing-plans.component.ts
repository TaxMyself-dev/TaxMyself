import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
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
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { AdminBillingService, AdminPlan, CreatePlanPayload } from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';

/** appendTo="body" is required on all overlay components inside a p-dialog
 *  to prevent the overlay from closing when the user scrolls inside the dialog. */
const MODULE_OPTIONS = [
  { label: 'חשבוניות', value: 'INVOICES' },
  { label: 'בנקאות פתוחה', value: 'OPEN_BANKING' },
  { label: 'רואה חשבון', value: 'ACCOUNTANT' },
];

@Component({
  selector: 'app-billing-plans',
  standalone: true,
  templateUrl: './billing-plans.component.html',
  styleUrls: ['./billing-plans.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    GenericTableComponent,
    ButtonComponent,
    InputTextComponent,
    DialogModule,
    ConfirmDialogModule,
    ToastModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    MultiSelectModule,
    TextareaModule,
  ],
  providers: [ConfirmationService, MessageService],
})
export class BillingPlansComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly moduleOptions = MODULE_OPTIONS;

  plans = signal<AdminPlan[]>([]);
  isLoading = signal(false);
  saving = signal(false);
  showDialog = signal(false);
  editingId = signal<number | null>(null);

  planForm = this.fb.group({
    slug:                ['', [Validators.required, Validators.maxLength(100)]],
    name:                ['', [Validators.required, Validators.maxLength(255)]],
    description:         [null as string | null],
    priceMonthlyShekels: [0, [Validators.required, Validators.min(0)]],
    currency:            ['ILS'],
    modules:             [[] as string[]],
    trialDays:           [14, [Validators.required, Validators.min(0)]],
    isActive:            [true],
    isPublic:            [true],
    displayOrder:        [0],
  });

  // ─── Table configuration ───────────────────────────────────────────────────

  readonly columnsTitle: IColumnDataTable<string, string>[] = [
    { name: 'name',         value: 'שם תוכנית',    type: FormTypes.TEXT },
    { name: 'slug',         value: 'Slug',          type: FormTypes.TEXT },
    { name: 'priceDisplay', value: 'מחיר חודשי',   type: FormTypes.TEXT },
    { name: 'modules',      value: 'מודולים',       type: FormTypes.TEXT },
    { name: 'trialDays',    value: 'ימי ניסיון',    type: FormTypes.NUMBER },
    { name: 'displayOrder', value: 'סדר תצוגה',    type: FormTypes.NUMBER },
    { name: 'isActive',     value: 'פעיל',          cellRenderer: ICellRenderer.CHECKBOX },
    { name: 'isPublic',     value: 'ציבורי',        cellRenderer: ICellRenderer.CHECKBOX },
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
    this.plans().map(p => ({
      id:           p.id,
      name:         p.name,
      slug:         p.slug,
      priceDisplay: `₪${(p.priceMonthlyAgorot / 100).toFixed(2)}`,
      modules:      p.modules?.join(', ') ?? '—',
      trialDays:    p.trialDays,
      displayOrder: p.displayOrder,
      isActive:     p.isActive,
      isPublic:     p.isPublic,
    }))
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadPlans();
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  loadPlans(): void {
    this.isLoading.set(true);
    this.adminBillingService.getPlans()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: plans => this.plans.set(plans),
        error: () => this.showError('שגיאה בטעינת תוכניות'),
      });
  }

  // ─── Dialog helpers ────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.planForm.reset({
      slug: '',
      name: '',
      description: null,
      priceMonthlyShekels: 0,
      currency: 'ILS',
      modules: [],
      trialDays: 14,
      isActive: true,
      isPublic: true,
      displayOrder: 0,
    });
    this.showDialog.set(true);
  }

  openEdit(id: number): void {
    const plan = this.plans().find(p => p.id === id);
    if (!plan) return;
    this.editingId.set(id);
    this.planForm.reset({
      slug:                plan.slug,
      name:                plan.name,
      description:         plan.description,
      priceMonthlyShekels: plan.priceMonthlyAgorot / 100,
      currency:            plan.currency,
      modules:             plan.modules ?? [],
      trialDays:           plan.trialDays,
      isActive:            plan.isActive,
      isPublic:            plan.isPublic,
      displayOrder:        plan.displayOrder,
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

  savePlan(): void {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }
    const raw = this.planForm.getRawValue();
    const payload: CreatePlanPayload = {
      slug:               raw.slug!,
      name:               raw.name!,
      description:        raw.description ?? undefined,
      priceMonthlyAgorot: Math.round((raw.priceMonthlyShekels ?? 0) * 100),
      currency:           raw.currency ?? 'ILS',
      modules:            raw.modules ?? [],
      trialDays:          raw.trialDays ?? 14,
      isActive:           raw.isActive ?? true,
      isPublic:           raw.isPublic ?? true,
      displayOrder:       raw.displayOrder ?? 0,
    };

    this.saving.set(true);
    const id = this.editingId();
    const request$ = id
      ? this.adminBillingService.updatePlan(id, payload)
      : this.adminBillingService.createPlan(payload);

    request$.pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: id ? 'התוכנית עודכנה בהצלחה' : 'התוכנית נוצרה בהצלחה',
          life: 3000,
        });
        this.closeDialog();
        this.loadPlans();
      },
      error: () => this.showError(id ? 'שגיאה בעדכון התוכנית' : 'שגיאה ביצירת התוכנית'),
    });
  }

  // ─── Activate / Deactivate ─────────────────────────────────────────────────

  confirmDeactivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם לנטרל את תוכנית "${row['name']}"?`,
      header: 'אישור נטרול',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, נטרל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, false),
    });
  }

  confirmActivate(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: `האם להפעיל מחדש את תוכנית "${row['name']}"?`,
      header: 'אישור הפעלה',
      icon: 'pi pi-info-circle',
      acceptLabel: 'כן, הפעל',
      rejectLabel: 'ביטול',
      accept: () => this.runActivation(row['id'] as number, true),
    });
  }

  private runActivation(id: number, activate: boolean): void {
    const request$ = activate
      ? this.adminBillingService.activatePlan(id)
      : this.adminBillingService.deactivatePlan(id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: activate ? 'התוכנית הופעלה מחדש' : 'התוכנית נוטרלה',
          life: 3000,
        });
        this.loadPlans();
      },
      error: () => this.showError(activate ? 'שגיאה בהפעלת התוכנית' : 'שגיאה בנטרול התוכנית'),
    });
  }

  // ─── Error helper ──────────────────────────────────────────────────────────

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 4000 });
  }

  // ─── Form field helpers ────────────────────────────────────────────────────

  get isEditMode(): boolean {
    return this.editingId() !== null;
  }

  fieldInvalid(name: string): boolean {
    const ctrl = this.planForm.get(name);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}

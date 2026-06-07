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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { DrawerModule } from 'primeng/drawer';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { AdminBillingService, AdminSubscription } from 'src/app/services/admin-billing.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';

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
  imports: [CommonModule, DrawerModule, GenericTableComponent, ButtonComponent],
  providers: [DatePipe],
})
export class BillingSubscriptionsComponent implements OnInit {
  private readonly adminBillingService = inject(AdminBillingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datePipe = inject(DatePipe);

  readonly buttonSize = ButtonSize;
  readonly statusLabels = STATUS_LABELS;

  // Angular 19: signal-based view query — no @ViewChild, no ngAfterViewInit
  private readonly statusTpl = viewChild<TemplateRef<any>>('statusTpl');

  subscriptions = signal<AdminSubscription[]>([]);
  isLoading = signal(false);
  selectedSub = signal<AdminSubscription | null>(null);
  showDrawer = signal(false);

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
}

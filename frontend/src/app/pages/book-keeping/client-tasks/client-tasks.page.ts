import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  ReportWorkflowService,
} from 'src/app/services/report-workflow.service';
import { GenericService } from 'src/app/services/generic.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import {
  ReportWorkflowStatus,
  ReportWorkflowStatusLabels,
  ReportWorkflowType,
  ReportWorkflowTypeLabels,
} from 'src/app/shared/enums';
import { ISelectItem, IReportWorkflow } from 'src/app/shared/interface';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';

@Component({
  selector: 'app-client-tasks',
  templateUrl: './client-tasks.page.html',
  styleUrls: ['./client-tasks.page.scss'],
  standalone: false,
})
export class ClientTasksPage implements OnInit {
  private readonly workflowService = inject(ReportWorkflowService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly genericService = inject(GenericService);
  private readonly fb = inject(FormBuilder);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;
  readonly ReportWorkflowStatus = ReportWorkflowStatus;

  readonly workflows = signal<IReportWorkflow[]>([]);
  readonly loading = signal<boolean>(false);
  readonly busyId = signal<number | null>(null);

  /** Filter signals — empty string / null means "all". Driven by the filter-tab apply event. */
  readonly businessFilter = signal<string>('');
  readonly typeFilter = signal<string>('');
  readonly yearFilter = signal<string>('');

  /**
   * Distinct businesses present in the current workflows, joined with the
   * friendly business name from GenericService. Shaped as ISelectItem so it
   * plugs directly into app-input-select via app-filter-tab.
   */
  readonly businessOptions = computed<ISelectItem[]>(() => {
    const numbers = new Set<string>();
    for (const w of this.workflows()) {
      if (w.businessNumber) numbers.add(w.businessNumber);
    }
    const nameByNumber = new Map<string, string>(
      this.genericService
        .businessSelectItems()
        .map((b) => [String(b.value), String(b.name)]),
    );
    return [...numbers].map((bn) => ({
      value: bn,
      name: nameByNumber.get(bn) ?? bn,
    }));
  });

  /** Task types actually present in the current workflows. */
  readonly typeOptions = computed<ISelectItem[]>(() => {
    const types = new Set<string>();
    for (const w of this.workflows()) {
      if (w.type) types.add(w.type);
    }
    return [...types].map((t) => ({
      value: t,
      name: ReportWorkflowTypeLabels[t] ?? t,
    }));
  });

  /** Years derived from periodStart, sorted descending. */
  readonly yearOptions = computed<ISelectItem[]>(() => {
    const years = new Set<number>();
    for (const w of this.workflows()) {
      if (!w.periodStart) continue;
      const y = new Date(w.periodStart).getUTCFullYear();
      if (!Number.isNaN(y)) years.add(y);
    }
    return [...years]
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), name: String(y) }));
  });

  /** Workflows after applying business/type/year filters. */
  readonly filteredWorkflows = computed<IReportWorkflow[]>(() => {
    const business = this.businessFilter();
    const type = this.typeFilter();
    const year = this.yearFilter();
    return this.workflows().filter((w) => {
      if (business && w.businessNumber !== business) return false;
      if (type && w.type !== type) return false;
      if (year) {
        if (!w.periodStart) return false;
        if (new Date(w.periodStart).getUTCFullYear() !== Number(year)) return false;
      }
      return true;
    });
  });

  /**
   * `canSelfMark` is a per-user property (same value across all of a user's
   * workflows), so any one row tells us which UI flow to render. Until rows
   * arrive, default to false so the page renders the conservative (delegated)
   * layout — avoids a flash of self-served UI for users who do have an accountant.
   */
  readonly isSelfServed = computed(() => {
    const rows = this.workflows();
    return rows.length > 0 && rows[0].canSelfMark === true;
  });

  // -------- Delegated buckets (preserved from before the split) --------
  readonly pending = computed(() =>
    this.filteredWorkflows().filter((w) => w.status === ReportWorkflowStatus.WAITING_FOR_CLIENT),
  );

  readonly recent = computed(() =>
    this.filteredWorkflows().filter((w) => w.status !== ReportWorkflowStatus.WAITING_FOR_CLIENT),
  );

  readonly selfMarkable = computed(() =>
    this.filteredWorkflows().filter(
      (w) => w.canSelfMark === true && w.status === ReportWorkflowStatus.READY_TO_PREPARE,
    ),
  );

  // -------- Self-served buckets --------
  /**
   * Reports the self-served user still has to file. Includes legacy
   * WAITING_FOR_CLIENT rows from before the generator change (or from a user
   * who removed their accountant). The `setReported(true)` endpoint handles
   * both states via the existing bypass path.
   */
  readonly toFile = computed(() =>
    this.filteredWorkflows().filter(
      (w) =>
        w.status === ReportWorkflowStatus.READY_TO_PREPARE ||
        w.status === ReportWorkflowStatus.WAITING_FOR_CLIENT,
    ),
  );

  readonly filed = computed(() =>
    this.filteredWorkflows().filter((w) => w.status === ReportWorkflowStatus.REPORTED),
  );

  // ---------- Filter-tab wiring (mirrors הכנסות / הוצאות for visual parity) ----------
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  private buildFilterConfig(): void {
    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        options: this.businessOptions,
      },
      {
        type: 'select',
        controlName: 'taskType',
        label: 'סוג משימה',
        options: this.typeOptions,
      },
      {
        type: 'select',
        controlName: 'year',
        label: 'שנה',
        options: this.yearOptions,
      },
    ];
  }

  /** Triggered by the filter-tab "הצג" button — copies form values into the filter signals. */
  onApplyFilters(values: { businessNumber?: string; taskType?: string; year?: string }): void {
    this.businessFilter.set(values?.businessNumber ?? '');
    this.typeFilter.set(values?.taskType ?? '');
    this.yearFilter.set(values?.year ?? '');
  }

  ngOnInit(): void {
    this.buildFilterConfig();
    this.fetchAll();
  }

  fetchAll(): void {
    this.loading.set(true);
    this.workflowService.listMine().subscribe({
      next: (rows) => {
        this.workflows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch workflows:', err);
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'טעינת המשימות נכשלה',
          life: 3000,
          key: 'br',
        });
      },
    });
  }

  confirmTask(workflow: IReportWorkflow): void {
    const periodLabel = this.formatPeriod(workflow);
    this.confirmationService.confirm({
      message: `אני מאשר/ת שהעלית את כל ההכנסות וההוצאות לתקופה ${periodLabel}.`,
      header: 'אישור',
      icon: 'pi pi-check-circle',
      acceptLabel: 'אישור',
      rejectLabel: 'ביטול',
      accept: () => this.runConfirm(workflow),
    });
  }

  /** Self-served clients (no accountant) mark their own workflow as reported. */
  markReported(workflow: IReportWorkflow): void {
    const periodLabel = this.formatPeriod(workflow);
    this.confirmationService.confirm({
      message: `לסמן את ${this.typeLabel(workflow.type)} לתקופה ${periodLabel} כדווח?`,
      header: 'סימון כדווח',
      icon: 'pi pi-send',
      acceptLabel: 'סמן כדווח',
      rejectLabel: 'ביטול',
      accept: () => this.runMarkReported(workflow),
    });
  }

  /**
   * Self-served clients can dismiss a workflow they don't want to track
   * (e.g. a period they reported outside the system). Soft-delete on the
   * backend; the unique index keeps the generator from recreating the row.
   */
  dismissTask(workflow: IReportWorkflow): void {
    if (!this.isSelfServed()) return;
    const periodLabel = this.formatPeriod(workflow);
    this.confirmationService.confirm({
      message: `למחוק את ${this.typeLabel(workflow.type)} לתקופה ${periodLabel}? לא ניתן לבטל.`,
      header: 'מחיקת משימה',
      icon: 'pi pi-trash',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.runDismiss(workflow),
    });
  }

  private runDismiss(workflow: IReportWorkflow): void {
    this.busyId.set(workflow.id);
    this.workflowService.dismiss(workflow.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.workflows.set(this.workflows().filter((w) => w.id !== workflow.id));
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'המשימה נמחקה',
          life: 2500,
          key: 'br',
        });
      },
      error: (err) => {
        this.busyId.set(null);
        const detail = err?.error?.message ?? err?.message ?? 'מחיקת המשימה נכשלה';
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail,
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  /** Open the stored as-filed report PDF in a new browser tab. */
  openReportFile(workflow: IReportWorkflow): void {
    this.busyId.set(workflow.id);
    this.workflowService.getReportFile(workflow.id).subscribe({
      next: (blob) => {
        this.busyId.set(null);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Revoke after the tab has had time to load the blob.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err) => {
        this.busyId.set(null);
        const detail = err?.error?.message ?? err?.message ?? 'פתיחת הדוח נכשלה';
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail,
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  private runMarkReported(workflow: IReportWorkflow): void {
    this.busyId.set(workflow.id);
    this.workflowService.setReported(workflow.id, true).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.workflows.set(
          this.workflows().map((w) => (w.id === updated.id ? updated : w)),
        );
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הדוח סומן כדווח',
          life: 2500,
          key: 'br',
        });
      },
      error: (err) => {
        this.busyId.set(null);
        const detail = err?.error?.message ?? err?.message ?? 'סימון הדוח נכשל';
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail,
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  private runConfirm(workflow: IReportWorkflow): void {
    this.busyId.set(workflow.id);
    this.workflowService.confirm(workflow.id).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        // Replace the row in the local signal so the UI updates immediately.
        this.workflows.set(
          this.workflows().map((w) => (w.id === updated.id ? updated : w)),
        );
        this.workflowService.decrementPendingCount();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'אישור נשלח לרואה החשבון',
          life: 2500,
          key: 'br',
        });
      },
      error: (err) => {
        this.busyId.set(null);
        const detail = err?.error?.message ?? err?.message ?? 'שמירת האישור נכשלה';
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail,
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  typeLabel(type: string): string {
    return ReportWorkflowTypeLabels[type] ?? type;
  }

  statusLabel(status: string): string {
    return ReportWorkflowStatusLabels[status] ?? status;
  }

  formatPeriod(w: IReportWorkflow): string {
    if (!w.periodStart || !w.periodEnd) return '';
    const start = new Date(w.periodStart);
    const end = new Date(w.periodEnd);
    const startMonth = start.getUTCMonth() + 1;
    const endMonth = end.getUTCMonth() + 1;
    const year = end.getUTCFullYear();
    return startMonth === endMonth
      ? `${startMonth}/${year}`
      : `${startMonth}-${endMonth}/${year}`;
  }
}

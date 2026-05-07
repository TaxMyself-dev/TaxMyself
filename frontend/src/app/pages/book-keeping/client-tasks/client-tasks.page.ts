import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  ReportWorkflowService,
} from 'src/app/services/report-workflow.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import {
  ReportWorkflowStatus,
  ReportWorkflowStatusLabels,
  ReportWorkflowTypeLabels,
} from 'src/app/shared/enums';
import { IReportWorkflow } from 'src/app/shared/interface';

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

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;
  readonly ReportWorkflowStatus = ReportWorkflowStatus;

  readonly workflows = signal<IReportWorkflow[]>([]);
  readonly loading = signal<boolean>(false);
  readonly busyId = signal<number | null>(null);

  readonly pending = computed(() =>
    this.workflows().filter((w) => w.status === ReportWorkflowStatus.WAITING_FOR_CLIENT),
  );

  readonly recent = computed(() =>
    this.workflows().filter((w) => w.status !== ReportWorkflowStatus.WAITING_FOR_CLIENT),
  );

  readonly selfMarkable = computed(() =>
    this.workflows().filter(
      (w) => w.canSelfMark === true && w.status === ReportWorkflowStatus.READY_TO_PREPARE,
    ),
  );

  ngOnInit(): void {
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

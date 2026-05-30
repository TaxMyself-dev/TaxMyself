import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClientPanelService, Client, CreateClientPayload } from 'src/app/services/clients-panel.service';
import { AuthService } from 'src/app/services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import {
  AccountantTaskSource,
  AccountantTaskType,
  AccountantTaskTypeLabels,
  AnnualReportStatus,
  AnnualReportStatusLabels,
  ReportWorkflowStatus,
  ReportWorkflowStatusLabels,
  businessTypeOptionsList,
  BusinessTypeLabels,
  VATReportingTypeLabels,
  TaxReportingTypeLabels,
} from 'src/app/shared/enums';
import {
  TaskDataService,
  TaskListQuery,
  TaskStatusFilter,
} from 'src/app/services/task-data.service';
import { ReportWorkflowService } from 'src/app/services/report-workflow.service';
import {
  IAccountantTask,
  ICreateAccountantTask,
} from 'src/app/shared/interface';

interface AddTaskFormData {
  /**
   * Selected business — the only owner-axis the form needs.
   * The clientFirebaseId is derived from the business at submit time
   * (one business → exactly one client by definition).
   */
  businessNumber: string;
  /** UI-only preset selector. 'CUSTOM' keeps the title input free for manual entry. */
  taskTypePreset: 'VAT_REPORT' | 'ADVANCE_TAX' | 'ANNUAL_REPORT' | 'CUSTOM';
  title: string;
  description: string;
  dueDate: string;
}

/**
 * Flat business option used in both the Tasks filter and the Add Task dialog.
 * Keeps `clientFirebaseId` alongside so submit can resolve the owner without a second lookup.
 */
interface BusinessOption {
  businessNumber: string;
  businessName: string;
  clientFirebaseId: string;
  clientName: string;
}

/** Presets shown in the "Add Task" dropdown — prefill title only, not stored in DB. */
const TASK_TYPE_PRESETS: ReadonlyArray<{
  value: AddTaskFormData['taskTypePreset'];
  label: string;
  /** Title prefilled when this preset is picked. 'CUSTOM' leaves the field as-is. */
  defaultTitle: string;
}> = [
  { value: 'VAT_REPORT', label: 'דוח מע"מ', defaultTitle: 'דוח מע"מ' },
  { value: 'ADVANCE_TAX', label: 'מקדמת מס', defaultTitle: 'מקדמת מס' },
  { value: 'ANNUAL_REPORT', label: 'דוח שנתי', defaultTitle: 'דוח שנתי' },
  { value: 'CUSTOM', label: 'אחר', defaultTitle: '' },
];

@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
  standalone: false,
})
export class ClientPanelPage implements OnInit {
  private readonly clientService = inject(ClientPanelService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly taskDataService = inject(TaskDataService);
  private readonly workflowService = inject(ReportWorkflowService);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;
  readonly AccountantTaskSource = AccountantTaskSource;
  readonly AccountantTaskType = AccountantTaskType;
  readonly AccountantTaskTypeLabels = AccountantTaskTypeLabels;
  readonly AnnualReportStatus = AnnualReportStatus;
  readonly AnnualReportStatusLabels = AnnualReportStatusLabels;
  readonly ReportWorkflowStatus = ReportWorkflowStatus;
  readonly ReportWorkflowStatusLabels = ReportWorkflowStatusLabels;

  readonly myClients = signal<Client[]>([]);

  /** Groups flat client rows by firebaseId — one entry per user, with a list of businesses. */
  readonly groupedClients = computed(() => {
    const map = new Map<string, { user: Client; businesses: Client[] }>();
    for (const c of this.myClients()) {
      if (!map.has(c.id)) {
        map.set(c.id, { user: c, businesses: [] });
      }
      if (c.businessId != null || c.businessName) {
        map.get(c.id)!.businesses.push(c);
      }
    }
    return Array.from(map.values());
  });
  readonly loadingClients = signal(false);

  readonly createClientModalVisible = signal(false);
  readonly creatingClient = signal(false);
  createClientFormData: CreateClientPayload = this.getEmptyClientFormData();
  readonly createClientErrors = signal<Record<string, string>>({});

  /** עוסק פטור, עוסק מורשה, חברה בע"מ – כמו בעמוד ההרשמה */
  readonly businessTypeOptions = businessTypeOptionsList;

  // ---------- Tasks tab state ----------
  /** 0 = הלקוחות שלי, 1 = משימות */
  readonly activeTabIndex = signal<number>(0);

  readonly tasks = signal<IAccountantTask[]>([]);
  readonly tasksLoading = signal(false);
  readonly statusFilter = signal<TaskStatusFilter>('open');
  /** Selected businessNumber for the Tasks tab filter. Empty string = all businesses. */
  readonly businessFilter = signal<string>('');
  /** Selected task type filter. Empty string = all types. */
  readonly taskTypeFilter = signal<string>('');
  /** Selected year filter (as string for select binding). Empty string = all years. */
  readonly yearFilter = signal<string>('');

  readonly addTaskModalVisible = signal(false);
  readonly addingTask = signal(false);
  addTaskFormData: AddTaskFormData = this.getEmptyTaskFormData();
  readonly addTaskErrors = signal<Record<string, string>>({});
  readonly taskTypePresets = TASK_TYPE_PRESETS;

  /** All task-type values shown in the type filter, with their Hebrew labels. */
  readonly taskTypeFilterOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: AccountantTaskType.VAT_REPORT, label: AccountantTaskTypeLabels[AccountantTaskType.VAT_REPORT] },
    { value: AccountantTaskType.ADVANCE_TAX, label: AccountantTaskTypeLabels[AccountantTaskType.ADVANCE_TAX] },
    { value: AccountantTaskType.ANNUAL_REPORT, label: AccountantTaskTypeLabels[AccountantTaskType.ANNUAL_REPORT] },
    { value: AccountantTaskType.CUSTOM, label: AccountantTaskTypeLabels[AccountantTaskType.CUSTOM] },
  ];

  /**
   * Distinct years extracted from the currently-fetched tasks. Auto tasks have a
   * `periodStart`; manual tasks fall back to `dueDate`. Sorted descending so the
   * most recent year is at the top.
   */
  readonly taskYearOptions = computed<number[]>(() => {
    const years = new Set<number>();
    for (const t of this.tasks()) {
      const dateStr = t.periodStart ?? t.dueDate;
      if (!dateStr) continue;
      const y = new Date(dateStr).getUTCFullYear();
      if (!Number.isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  });

  /** Tasks after applying the in-memory type + year filters (status + business already filtered server-side). */
  readonly filteredTasks = computed<IAccountantTask[]>(() => {
    const type = this.taskTypeFilter();
    const year = this.yearFilter();
    return this.tasks().filter((t) => {
      if (type && t.type !== type) return false;
      if (year) {
        const dateStr = t.periodStart ?? t.dueDate;
        if (!dateStr) return false;
        if (new Date(dateStr).getUTCFullYear() !== Number(year)) return false;
      }
      return true;
    });
  });

  /**
   * Flat list of every (client, business) pair the accountant can act on —
   * used by both the Tasks tab filter and the Add Task dialog.
   * Skips rows without a businessNumber since neither filtering nor task
   * creation can target them.
   */
  readonly businessOptions = computed<BusinessOption[]>(() => {
    const opts: BusinessOption[] = [];
    for (const group of this.groupedClients()) {
      const clientName = group.user.fullName || group.user.email;
      for (const biz of group.businesses) {
        if (!biz.businessNumber) continue;
        opts.push({
          businessNumber: biz.businessNumber,
          businessName: biz.businessName ?? biz.businessNumber,
          clientFirebaseId: group.user.id,
          clientName,
        });
      }
    }
    return opts;
  });

  private getEmptyClientFormData(): CreateClientPayload {
    return {
      email: '',
      phone: '',
      fName: '',
      lName: '',
      id: '',
      dateOfBirth: '',
      businessType: '',
      businessName: '',
      businessNumber: '',
      address: '',
    };
  }

  private getEmptyTaskFormData(): AddTaskFormData {
    return {
      businessNumber: '',
      taskTypePreset: 'CUSTOM',
      title: '',
      description: '',
      dueDate: '',
    };
  }

  ngOnInit(): void {
    // Only clear "selected client" when the SIGNED-IN user owns this page —
    // i.e., an accountant returning from drilling into one of their clients.
    // When an admin is impersonating an accountant, `selectedClientId` IS the
    // impersonation marker; clearing it here would silently drop the admin
    // back to their own session and 403 any subsequent role-gated request
    // (e.g. /accountant-tasks expects ACCOUNTANT, gets the admin's row).
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    const realUserIsAdmin = !!realUser?.role?.includes('ADMIN');
    if (!realUserIsAdmin) {
      this.clientService.clearSelectedClient();
    }
    this.fetchClients();
  }

  fetchClients(): void {
    this.loadingClients.set(true);
    this.clientService.getMyClients().subscribe({
      next: (clients) => {
        this.myClients.set(clients);
        this.loadingClients.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch clients:', err);
        this.loadingClients.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'טעינת רשימת הלקוחות נכשלה',
          life: 3000,
          key: 'br',
        });
      },
    });
  }

  /** תרגום סוג העסק: עוסק פטור, עוסק מורשה, חברה בע"מ */
  businessTypeLabel(value: string): string {
    return value ? (BusinessTypeLabels[value as keyof typeof BusinessTypeLabels] ?? value) : '—';
  }

  vatReportingTypeLabel(value: string | null): string {
    return value ? (VATReportingTypeLabels[value] ?? value) : '—';
  }

  taxReportingTypeLabel(value: string | null): string {
    return value ? (TaxReportingTypeLabels[value] ?? value) : '—';
  }

  /** כניסה לחשבון הלקוח בתור הרואה חשבון – מגדיר גם את מספר העסק של הלקוח להקשר הבקשות */
  enterClient(client: Client): void {
    this.clientService.setSelectedClient(client.id, client.fullName);
    this.authService.setActiveBusinessNumber(client.businessNumber ?? null);
    this.router.navigate(['/my-account']);
  }

  /** מחיקת לקוח מהרשימה (הסרת הקישור בלבד) */
  confirmDeleteClient(client: Client): void {
    this.confirmationService.confirm({
      message: `האם למחוק את הלקוח "${client.fullName}" מהרשימה? הפעולה תסיר את הקישור בלבד.`,
      header: 'אישור מחיקה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteClient(client.id),
    });
  }

  private deleteClient(clientId: string): void {
    this.clientService.deleteClient(clientId).subscribe({
      next: () => {
        this.clientService.clearClientsCache();
        this.fetchClients();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הלקוח הוסר מהרשימה',
          life: 3000,
          key: 'br',
        });
      },
      error: (err) => {
        const detail = err?.error?.message ?? err?.message ?? 'מחיקה נכשלה. נסה שוב.';
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

  openCreateClientModal(): void {
    this.createClientFormData = this.getEmptyClientFormData();
    this.createClientErrors.set({});
    this.createClientModalVisible.set(true);
  }

  closeCreateClientModal(): void {
    this.createClientModalVisible.set(false);
  }

  private validateCreateClientForm(): boolean {
    const form = this.createClientFormData;
    const err: Record<string, string> = {};
    const email = (form.email ?? '').trim();
    const phone = (form.phone ?? '').trim();
    if (!email) err['email'] = 'אימייל חובה';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err['email'] = 'כתובת אימייל לא חוקית';
    if (!phone) err['phone'] = 'פלאפון חובה';
    this.createClientErrors.set(err);
    return Object.keys(err).length === 0;
  }

  submitCreateClient(): void {
    if (!this.validateCreateClientForm()) return;
    this.creatingClient.set(true);
    const form = this.createClientFormData;
    const payload: CreateClientPayload = {
      email: form.email.trim(),
      phone: form.phone.trim(),
      fName: form.fName?.trim() || undefined,
      lName: form.lName?.trim() || undefined,
      id: form.id?.trim() || undefined,
      dateOfBirth: form.dateOfBirth?.trim() || undefined,
      businessType: form.businessType?.trim() || undefined,
      businessName: form.businessName?.trim() || undefined,
      businessNumber: form.businessNumber?.trim() || undefined,
      address: form.address?.trim() || undefined,
    };
    this.clientService.createClient(payload).subscribe({
      next: () => {
        this.clientService.clearClientsCache();
        this.fetchClients();
        this.closeCreateClientModal();
        this.creatingClient.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הלקוח נוסף בהצלחה',
          life: 3000,
          key: 'br',
        });
      },
      error: (err) => {
        this.creatingClient.set(false);
        const detail = err?.error?.message ?? err?.message ?? 'לא ניתן להוסיף לקוח. נסה שוב.';
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

  // ===================== Tasks tab =====================

  onTabChange(index: number): void {
    this.activeTabIndex.set(index);
    if (index === 1 && this.tasks().length === 0 && !this.tasksLoading()) {
      this.fetchTasks();
    }
  }

  fetchTasks(): void {
    this.tasksLoading.set(true);
    const query: TaskListQuery = {
      status: this.statusFilter(),
      businessNumber: this.businessFilter() || undefined,
    };
    this.taskDataService.getTasks(query).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.tasksLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch tasks:', err);
        this.tasksLoading.set(false);
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

  /** הרצה ידנית של מחולל המשימות התקופתיות (אותה לוגיקה שהקרון מריץ יומית) */
  readonly runningGeneration = signal<boolean>(false);

  runGeneration(): void {
    if (this.runningGeneration()) return;
    this.runningGeneration.set(true);
    this.taskDataService.runGeneration().subscribe({
      next: (result) => {
        this.runningGeneration.set(false);
        this.fetchTasks();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: `נוצרו ${result.created} משימות חדשות${result.skipped > 0 ? `, ${result.skipped} כבר קיימות` : ''}`,
          life: 3500,
          key: 'br',
        });
      },
      error: (err) => {
        this.runningGeneration.set(false);
        const detail = err?.error?.message ?? err?.message ?? 'הרצת מחולל המשימות נכשלה';
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

  onStatusFilterChange(value: TaskStatusFilter): void {
    this.statusFilter.set(value);
    this.fetchTasks();
  }

  onBusinessFilterChange(value: string): void {
    this.businessFilter.set(value);
    this.fetchTasks();
  }

  onTaskTypeFilterChange(value: string): void {
    this.taskTypeFilter.set(value);
  }

  onYearFilterChange(value: string): void {
    this.yearFilter.set(value);
  }

  openAddTaskModal(): void {
    this.addTaskFormData = this.getEmptyTaskFormData();
    this.addTaskErrors.set({});
    this.addTaskModalVisible.set(true);
  }

  closeAddTaskModal(): void {
    this.addTaskModalVisible.set(false);
  }

  /** Prefill the title from the chosen preset; CUSTOM ('אחר') leaves the title untouched. */
  onAddTaskTypePresetChange(): void {
    const preset = TASK_TYPE_PRESETS.find(
      (p) => p.value === this.addTaskFormData.taskTypePreset,
    );
    if (preset && preset.value !== 'CUSTOM') {
      this.addTaskFormData.title = preset.defaultTitle;
    }
  }

  private validateAddTaskForm(): boolean {
    const form = this.addTaskFormData;
    const err: Record<string, string> = {};
    if (!form.businessNumber) err['businessNumber'] = 'נא לבחור עסק';
    if (!form.title?.trim()) err['title'] = 'כותרת חובה';
    this.addTaskErrors.set(err);
    return Object.keys(err).length === 0;
  }

  submitAddTask(): void {
    if (!this.validateAddTaskForm()) return;
    const form = this.addTaskFormData;
    const business = this.businessOptions().find(
      (b) => b.businessNumber === form.businessNumber,
    );
    if (!business) {
      this.addTaskErrors.set({ businessNumber: 'נא לבחור עסק' });
      return;
    }
    this.addingTask.set(true);
    const payload: ICreateAccountantTask = {
      clientFirebaseId: business.clientFirebaseId,
      businessNumber: business.businessNumber,
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      dueDate: form.dueDate?.trim() || undefined,
    };
    this.taskDataService.addTask(payload).subscribe({
      next: () => {
        this.addingTask.set(false);
        this.closeAddTaskModal();
        this.fetchTasks();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'המשימה נוספה',
          life: 3000,
          key: 'br',
        });
      },
      error: (err) => {
        this.addingTask.set(false);
        const detail = err?.error?.message ?? err?.message ?? 'הוספת המשימה נכשלה';
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

  toggleTaskComplete(task: IAccountantTask): void {
    const next = !task.isComplete;
    this.taskDataService.updateTask(task.id, { isComplete: next }).subscribe({
      next: () => {
        this.fetchTasks();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: next ? 'המשימה סומנה כהושלמה' : 'המשימה הוחזרה לפתוחה',
          life: 2000,
          key: 'br',
        });
      },
      error: (err) => {
        const detail = err?.error?.message ?? err?.message ?? 'עדכון המשימה נכשל';
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

  confirmDeleteTask(task: IAccountantTask): void {
    const isAuto = task.source === AccountantTaskSource.AUTO;
    const message = isAuto
      ? `המשימה "${task.title}" נוצרה אוטומטית. האם להסתיר אותה מהרשימה?`
      : `האם למחוק את המשימה "${task.title}"?`;
    this.confirmationService.confirm({
      message,
      header: 'אישור מחיקה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: isAuto ? 'הסתר' : 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteTask(task),
    });
  }

  private deleteTask(task: IAccountantTask): void {
    this.taskDataService.deleteTask(task.id).subscribe({
      next: () => {
        this.fetchTasks();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: task.source === AccountantTaskSource.AUTO ? 'המשימה הוסתרה' : 'המשימה נמחקה',
          life: 3000,
          key: 'br',
        });
      },
      error: (err) => {
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

  taskTypeLabel(type: string): string {
    return AccountantTaskTypeLabels[type] ?? type;
  }

  /** ת.יעד שעבר ולא הושלם */
  isTaskOverdue(task: IAccountantTask): boolean {
    if (task.isComplete || !task.dueDate) return false;
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  }

  /** ת.יעד תוך 7 ימים */
  isTaskDueSoon(task: IAccountantTask): boolean {
    if (task.isComplete || !task.dueDate || this.isTaskOverdue(task)) return false;
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return due.getTime() - today.getTime() <= sevenDays;
  }

  /** סטטוס דוח שנתי (תוויות עבריות) */
  annualReportStatusLabel(status: string | undefined): string {
    return status ? AnnualReportStatusLabels[status] ?? status : '';
  }

  /** מעבר לדף הדוח השנתי בהקשר של הלקוח (view-as) */
  openAnnualReport(task: IAccountantTask): void {
    if (task.type !== AccountantTaskType.ANNUAL_REPORT) return;
    const taxYear = task.periodStart ? new Date(task.periodStart).getUTCFullYear() : null;
    // שמירת הקשר הלקוח לסרגל הצד / כותרת
    this.clientService.setSelectedClient(task.clientFirebaseId, task.clientName ?? '');
    this.authService.setActiveBusinessNumber(task.businessNumber);
    this.router.navigate(['/annual-report'], {
      queryParams: taxYear ? { taxYear } : {},
    });
  }

  /** סטטוס תהליך דיווח (תוויות עבריות) – משמש לתאי הסטטוס של VAT/ADVANCE_TAX */
  workflowStatusLabel(status: string | undefined): string {
    return status ? ReportWorkflowStatusLabels[status] ?? status : '';
  }

  /** האם להציג כפתור "סמן כדווח" עבור משימה זו */
  canMarkReported(task: IAccountantTask): boolean {
    return (
      !!task.workflowId &&
      (task.workflowStatus === ReportWorkflowStatus.READY_TO_PREPARE ||
        task.workflowStatus === ReportWorkflowStatus.WAITING_FOR_CLIENT)
    );
  }

  /** האם להציג כפתור "בטל סימון" (כאשר כבר דווח) */
  canRevertReported(task: IAccountantTask): boolean {
    return !!task.workflowId && task.workflowStatus === ReportWorkflowStatus.REPORTED;
  }

  /** האם להציג כפתור "צפה בדוח" – קיים קובץ דוח שמור */
  canViewReportFile(task: IAccountantTask): boolean {
    return !!task.workflowId && task.hasReportFile === true;
  }

  /** פתיחת קובץ הדוח השמור (PDF) בלשונית חדשה. */
  openReportFile(task: IAccountantTask): void {
    if (!task.workflowId) return;
    this.workflowService.getReportFile(task.workflowId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err) => {
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

  /** רואה החשבון מסמן את הדוח כדווח. אם הלקוח עדיין לא אישר – מאמת לפני העדכון. */
  markWorkflowReported(task: IAccountantTask): void {
    if (!task.workflowId) return;
    const isBypass = task.workflowStatus === ReportWorkflowStatus.WAITING_FOR_CLIENT;
    this.confirmationService.confirm({
      message: isBypass
        ? 'הלקוח עוד לא אישר. לסמן בכל זאת כדווח?'
        : 'לסמן את הדוח כדווח?',
      header: 'סימון כדווח',
      icon: 'pi pi-check-circle',
      acceptLabel: 'סמן כדווח',
      rejectLabel: 'ביטול',
      accept: () => this.runSetReported(task, true),
    });
  }

  /** ביטול סימון "דווח" – חוזר לסטטוס "מוכן להכנה". */
  unmarkWorkflowReported(task: IAccountantTask): void {
    if (!task.workflowId) return;
    this.confirmationService.confirm({
      message: 'לבטל את סימון הדיווח? הסטטוס יחזור ל"מוכן להכנה".',
      header: 'ביטול סימון',
      icon: 'pi pi-undo',
      acceptLabel: 'בטל סימון',
      rejectLabel: 'השאר',
      accept: () => this.runSetReported(task, false),
    });
  }

  private runSetReported(task: IAccountantTask, reported: boolean): void {
    if (!task.workflowId) return;
    this.workflowService.setReported(task.workflowId, reported).subscribe({
      next: () => {
        this.fetchTasks();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: reported ? 'הדוח סומן כדווח' : 'הסימון בוטל',
          life: 2500,
          key: 'br',
        });
      },
      error: (err) => {
        const detail = err?.error?.message ?? err?.message ?? 'עדכון הסטטוס נכשל';
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
}

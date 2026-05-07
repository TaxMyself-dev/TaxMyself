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
  clientFirebaseId: string;
  businessNumber: string;
  title: string;
  description: string;
  dueDate: string;
}

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
  readonly clientFilter = signal<string>('');

  readonly addTaskModalVisible = signal(false);
  readonly addingTask = signal(false);
  addTaskFormData: AddTaskFormData = this.getEmptyTaskFormData();
  readonly addTaskErrors = signal<Record<string, string>>({});

  /** כל הלקוחות שיש להם לפחות עסק אחד עם businessNumber – לבחירה במשימה ידנית */
  readonly clientsForTaskAssignment = computed(() => {
    return this.groupedClients().filter((g) =>
      g.businesses.some((b) => !!b.businessNumber),
    );
  });

  /** העסקים של הלקוח שנבחר בטופס המשימה הידנית */
  readonly addTaskBusinesses = computed(() => {
    const clientId = this.addTaskFormData.clientFirebaseId;
    if (!clientId) return [];
    const group = this.groupedClients().find((g) => g.user.id === clientId);
    return (group?.businesses ?? []).filter((b) => !!b.businessNumber);
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
      clientFirebaseId: '',
      businessNumber: '',
      title: '',
      description: '',
      dueDate: '',
    };
  }

  ngOnInit(): void {
    this.clientService.clearSelectedClient();
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
      clientId: this.clientFilter() || undefined,
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

  onClientFilterChange(value: string): void {
    this.clientFilter.set(value);
    this.fetchTasks();
  }

  openAddTaskModal(): void {
    this.addTaskFormData = this.getEmptyTaskFormData();
    this.addTaskErrors.set({});
    this.addTaskModalVisible.set(true);
  }

  closeAddTaskModal(): void {
    this.addTaskModalVisible.set(false);
  }

  /** Reset business selection when the client changes — businesses depend on the chosen client */
  onAddTaskClientChange(): void {
    this.addTaskFormData.businessNumber = '';
  }

  private validateAddTaskForm(): boolean {
    const form = this.addTaskFormData;
    const err: Record<string, string> = {};
    if (!form.clientFirebaseId) err['clientFirebaseId'] = 'נא לבחור לקוח';
    if (!form.businessNumber) err['businessNumber'] = 'נא לבחור עסק';
    if (!form.title?.trim()) err['title'] = 'כותרת חובה';
    this.addTaskErrors.set(err);
    return Object.keys(err).length === 0;
  }

  submitAddTask(): void {
    if (!this.validateAddTaskForm()) return;
    this.addingTask.set(true);
    const form = this.addTaskFormData;
    const payload: ICreateAccountantTask = {
      clientFirebaseId: form.clientFirebaseId,
      businessNumber: form.businessNumber,
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

import { Component, OnInit, inject, signal } from '@angular/core';
import { ClientPanelService, CreateClientPayload } from 'src/app/services/clients-panel.service';
import { ISelectItem } from 'src/app/shared/interface';
import { MessageService } from 'primeng/api';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
  standalone: false,
})
export class ClientPanelPage implements OnInit {
  private readonly clientService = inject(ClientPanelService);
  private readonly messageService = inject(MessageService);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  /** רשימת הלקוחות לתצוגה */
  readonly myClients = signal<ISelectItem[]>([]);
  readonly loadingClients = signal(false);

  /** מודל הקמת לקוח */
  readonly createClientModalVisible = signal(false);
  readonly creatingClient = signal(false);
  /** נתוני טופס הקמת לקוח (אובייקט רגיל ל-ngModel) */
  createClientFormData: CreateClientPayload = {
    email: '',
    phone: '',
    fName: '',
    lName: '',
    id: '',
  };
  /** הודעות שגיאה ולידציה לטפס הקמת לקוח */
  readonly createClientErrors = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.fetchClients();
  }

  /** טעינת רשימת הלקוחות מהשרת */
  fetchClients(): void {
    this.loadingClients.set(true);
    this.clientService.getMyClients().subscribe({
      next: (clients) => {
        const items: ISelectItem[] = clients.map((c) => ({
          value: c.id,
          name: c.name,
        }));
        this.myClients.set(items);
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

  /** פתיחת מודל הקמת לקוח */
  openCreateClientModal(): void {
    this.createClientFormData = {
      email: '',
      phone: '',
      fName: '',
      lName: '',
      id: '',
    };
    this.createClientErrors.set({});
    this.createClientModalVisible.set(true);
  }

  /** סגירת מודל הקמת לקוח */
  closeCreateClientModal(): void {
    this.createClientModalVisible.set(false);
  }

  /** ולידציה בסיסית לטפס הקמת לקוח */
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

  /** שליחת טופס הקמת לקוח */
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

}

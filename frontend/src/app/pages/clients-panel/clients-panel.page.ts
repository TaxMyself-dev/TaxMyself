import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClientPanelService, Client, CreateClientPayload } from 'src/app/services/clients-panel.service';
import { AuthService } from 'src/app/services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { businessTypeOptionsList, BusinessTypeLabels } from 'src/app/shared/enums';

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

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  readonly myClients = signal<Client[]>([]);
  readonly loadingClients = signal(false);

  readonly createClientModalVisible = signal(false);
  readonly creatingClient = signal(false);
  createClientFormData: CreateClientPayload = this.getEmptyFormData();
  readonly createClientErrors = signal<Record<string, string>>({});

  /** עוסק פטור, עוסק מורשה, חברה בע"מ – כמו בעמוד ההרשמה */
  readonly businessTypeOptions = businessTypeOptionsList;

  private getEmptyFormData(): CreateClientPayload {
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
    this.createClientFormData = this.getEmptyFormData();
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
}

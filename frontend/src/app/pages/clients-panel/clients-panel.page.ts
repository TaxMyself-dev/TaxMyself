import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClientPanelService, Client, CreateClientPayload } from 'src/app/services/clients-panel.service';
import { MessageService } from 'primeng/api';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

/** ערכי סוג העסק כמו בבקאנד */
const BUSINESS_STATUS_MAP: Record<string, string> = {
  NO_BUSINESS: 'ללא עסק',
  SINGLE_BUSINESS: 'עסק בודד',
  MULTI_BUSINESS: 'מספר עסקים',
};

@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
  standalone: false,
})
export class ClientPanelPage implements OnInit {
  private readonly clientService = inject(ClientPanelService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  readonly myClients = signal<Client[]>([]);
  readonly loadingClients = signal(false);

  readonly createClientModalVisible = signal(false);
  readonly creatingClient = signal(false);
  createClientFormData: CreateClientPayload = this.getEmptyFormData();
  readonly createClientErrors = signal<Record<string, string>>({});

  readonly businessStatusOptions = [
    { value: 'NO_BUSINESS', label: 'ללא עסק' },
    { value: 'SINGLE_BUSINESS', label: 'עסק בודד' },
    { value: 'MULTI_BUSINESS', label: 'מספר עסקים' },
  ];

  private getEmptyFormData(): CreateClientPayload {
    return {
      email: '',
      phone: '',
      fName: '',
      lName: '',
      id: '',
      dateOfBirth: '',
      businessStatus: '',
      businessName: '',
    };
  }

  ngOnInit(): void {
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

  businessStatusLabel(value: string): string {
    return value ? (BUSINESS_STATUS_MAP[value] ?? value) : '—';
  }

  /** כניסה לחשבון הלקוח בתור הרואה חשבון */
  enterClient(clientId: string): void {
    this.clientService.setSelectedClientId(clientId);
    this.router.navigate(['/my-account']);
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
      businessStatus: form.businessStatus?.trim() || undefined,
      businessName: form.businessName?.trim() || undefined,
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

import { Component, OnInit, computed, signal } from '@angular/core';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { FeezbackService, AdminAccountsAndCardsResponse, AdminPullSourceResult } from 'src/app/services/feezback.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes } from 'src/app/shared/enums';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

interface AdminSourceRow {
  type: 'bank' | 'card';
  paymentIdentifier: string;
  consentStatus: string;
  ownerName: string | null;
  product: string | null;
}

@Component({
  selector: 'app-clients-dashboard',
  templateUrl: './clients-dashboard.component.html',
  styleUrls: ['./clients-dashboard.component.scss'],
  standalone: false
})
export class ClientsDashboardComponent implements OnInit {
  isLoading = signal<boolean>(false);
  isClearingCache = signal<boolean>(false);
  users: any[] = [];
  filteredUsers: any[] = [];
  visibleFeezbackDialog = signal<boolean>(false);
  selectedClient = signal<{ firebaseId: string; name: string } | null>(null);

  // Admin: live accounts/cards diagnostic dialog
  accountsDialogVisible = signal<boolean>(false);
  accountsDialogLoading = signal<boolean>(false);
  accountsDialogClientName = signal<string>('');
  accountsDialogData = signal<AdminAccountsAndCardsResponse | null>(null);
  accountsDialogClientFirebaseId = signal<string>('');
  refreshingSourcesFor = signal<string | null>(null);
  refreshingSourcesName = signal<string>('');

  // Per-source pull (admin "הצגת חשבונות" dialog): which source is in-flight,
  // and the last result keyed by `${type}_${paymentIdentifier}`.
  pullingSourceKey = signal<string | null>(null);
  pullResultByKey = signal<Record<string, AdminPullSourceResult>>({});

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  sourceKey(src: AdminSourceRow): string {
    return `${src.type}_${src.paymentIdentifier}`;
  }

  /**
   * Mirror of the backend's deriveSourceName: ILS → no suffix; non-ILS gets a
   * symbol ($, €, £, ¥) or `-CODE` fallback. Keeps the displayed paymentIdentifier
   * identical to what the backend writes to source.sourceName.
   */
  private static readonly CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  };

  private deriveSourceName(rawId: string, currency: string | null | undefined): string {
    if (!rawId) return rawId;
    const c = (currency ?? 'ILS').toUpperCase();
    if (c === 'ILS') return rawId;
    const symbol = ClientsDashboardComponent.CURRENCY_SYMBOLS[c];
    return symbol ? `${rawId}${symbol}` : `${rawId}-${c}`;
  }

  /** Compact per-source rows derived from the live Feezback response. */
  accountsDialogSources = computed<AdminSourceRow[]>(() => {
    const data = this.accountsDialogData();
    if (!data) return [];
    const rows: AdminSourceRow[] = [];
    const banks = data.accounts?.accounts ?? [];
    for (const acc of banks) {
      const iban: string | undefined = acc?.iban;
      const rawId = iban?.trim().slice(-7);
      if (!rawId) continue;
      rows.push({
        type: 'bank',
        paymentIdentifier: this.deriveSourceName(rawId, acc?.currency),
        consentStatus: acc?.consentStatus ?? '—',
        ownerName: acc?.ownerName ?? acc?.name ?? null,
        product: acc?.product ?? null,
      });
    }
    const cards = data.cards?.cards ?? [];
    for (const card of cards) {
      const maskedPan: string | undefined = card?.maskedPan;
      const rawId = typeof maskedPan === 'string' ? maskedPan.match(/(\d{4})$/)?.[1] : undefined;
      if (!rawId) continue;
      rows.push({
        type: 'card',
        paymentIdentifier: this.deriveSourceName(rawId, card?.currency),
        consentStatus: card?.consentStatus ?? '—',
        ownerName: card?.ownerName ?? card?.name ?? null,
        product: card?.product ?? null,
      });
    }
    return rows;
  });

  consentStatusColor(status: string): string {
    return status === 'valid' ? '#16a34a' : '#dc2626';
  }

  columnsTitle: IColumnDataTable<any, any>[] = [
    { name: 'fullName', value: 'שם מלא', type: FormTypes.TEXT },
    { name: 'email', value: 'אימייל', type: FormTypes.TEXT },
    { name: 'phone', value: 'טלפון', type: FormTypes.TEXT },
    { name: 'city', value: 'עיר', type: FormTypes.TEXT },
    { name: 'payStatus', value: 'סטטוס תשלום', type: FormTypes.TEXT },
    { name: 'generalDocumentsCount', value: 'מסמכים (כללי)', type: FormTypes.NUMBER },
    { name: 'createdAt', value: 'תאריך רישום', type: FormTypes.DATE },
    { name: 'subscriptionEndDate', value: 'תאריך סיום מנוי', type: FormTypes.DATE },
  ];

  fileActions: ITableRowAction[] = [
    {
      name: 'feezback',
      icon: 'pi pi-cloud-download',
      title: 'טען תנועות מ-Feezback',
      alwaysShow: true,
      action: (event: any, row: IRowDataTable) => {
        this.openFeezbackDialog(row);
      }
    },
    {
      name: 'getAccounts',
      icon: 'pi pi-list',
      title: 'הצגת חשבונות וכרטיסים',
      alwaysShow: true,
      action: (event: any, row: IRowDataTable) => {
        this.openClientAccountsDialog(row);
      }
    },
    {
      name: 'refreshSources',
      icon: 'pi pi-refresh',
      title: 'רענון מקורות',
      alwaysShow: true,
      // No isLoading getter — feedback is shown in a modal dialog (driven by
      // refreshingSourcesFor) instead of a button spinner. The dialog's mask
      // also blocks duplicate clicks.
      action: (event: any, row: IRowDataTable) => {
        this.confirmRefreshSources(row);
      }
    },
    {
      name: 'clearCache',
      icon: 'pi pi-trash',
      title: 'מחק מטמון תנועות',
      alwaysShow: true,
      isLoading: () => this.isClearingCache(),
      action: (event: any, row: IRowDataTable) => {
        this.confirmClearCache(row);
      }
    }
  ];

  searchTerm: string = '';

  constructor(
    private adminPanelService: AdminPanelService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private feezbackService: FeezbackService,
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.isLoading.set(true);
    this.adminPanelService.getAllUsers()
      .pipe(
        catchError(err => {
          console.error('Error loading users:', err);
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(users => {
        this.users = users.map((user: any) => {
          const mappedUser: any = {
            ...user,
            fullName: `${user.fName || ''} ${user.lName || ''}`.trim(),
            payStatus: this.getPayStatusLabel(user.payStatus),
            generalDocumentsCount:
              user.generalDocumentsCount != null ? Number(user.generalDocumentsCount) : 0,
          };
          
          // Ensure dates are properly formatted
          if (user.createdAt) {
            mappedUser.createdAt = new Date(user.createdAt);
          }
          if (user.subscriptionEndDate) {
            mappedUser.subscriptionEndDate = new Date(user.subscriptionEndDate);
          }
          
          return mappedUser;
        });
        this.filteredUsers = [...this.users];
      });
  }

  getPayStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'TRIAL': 'ניסיון',
      'PAID': 'שולם',
      'PAYMENT_REQUIRED': 'נדרש תשלום',
      'FREE': 'חינם',
    };
    return statusMap[status] || status;
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value || '';
    if (!this.searchTerm) {
      this.filteredUsers = [...this.users];
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredUsers = this.users.filter(user =>
      user.fullName?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.phone?.includes(term) ||
      user.city?.toLowerCase().includes(term)
    );
  }

  getTotalUsers(): number {
    return this.users?.length || 0;
  }

  getUsersByStatus(status: string): number {
    if (!this.users || this.users.length === 0) {
      return 0;
    }
    return this.users.filter(u => u.payStatus === status).length;
  }

  openFeezbackDialog(row: IRowDataTable): void {
    this.selectedClient.set({
      firebaseId: row['firebaseId'] as string,
      name: row['fullName'] as string || `${row['fName'] || ''} ${row['lName'] || ''}`.trim()
    });
    this.visibleFeezbackDialog.set(true);
  }

  confirmClearCache(row: IRowDataTable): void {
    const firebaseId = row['firebaseId'] as string;
    const name = (row['fullName'] as string) || `${row['fName'] || ''} ${row['lName'] || ''}`.trim();
    this.confirmationService.confirm({
      message: `האם אתה בטוח שברצונך למחוק את מטמון התנועות של ${name}? הסינכרון יתחיל מחדש בכניסה הבאה.`,
      header: 'מחיקת מטמון תנועות',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, מחק',
      rejectLabel: 'ביטול',
      accept: () => {
        this.isClearingCache.set(true);
        this.adminPanelService.clearUserCache(firebaseId)
          .pipe(
            finalize(() => this.isClearingCache.set(false)),
            catchError(err => {
              console.error('Error clearing cache:', err);
              this.messageService.add({
                severity: 'error',
                summary: 'שגיאה',
                detail: `לא הצלחנו למחוק את המטמון של ${name}. אנא נסה שוב.`,
                life: 5000,
                key: 'br'
              });
              return EMPTY;
            })
          )
          .subscribe(() => {
            this.messageService.add({
              severity: 'success',
              summary: 'הצלחה',
              detail: `המטמון של ${name} נמחק בהצלחה. הסינכרון יתחיל מחדש בכניסה הבאה.`,
              life: 5000,
              key: 'br'
            });
          });
      },
    });
  }

  closeFeezbackDialog(event?: { visible: boolean }): void {
    if (event && !event.visible) {
      this.visibleFeezbackDialog.set(false);
      this.selectedClient.set(null);
    } else {
      this.visibleFeezbackDialog.set(false);
      this.selectedClient.set(null);
    }
  }

  openClientAccountsDialog(row: IRowDataTable): void {
    const firebaseId = row['firebaseId'] as string;
    const name = (row['fullName'] as string) || `${row['fName'] || ''} ${row['lName'] || ''}`.trim();
    this.confirmationService.confirm({
      message: `להציג את החשבונות והכרטיסים של "${name}" מ-Feezback?`,
      header: 'אישור הצגת חשבונות',
      icon: 'pi pi-list',
      acceptLabel: 'הצג',
      rejectLabel: 'ביטול',
      accept: () => this.runGetAccountsAndCards(firebaseId, name),
    });
  }

  private runGetAccountsAndCards(firebaseId: string, name: string): void {
    this.accountsDialogClientName.set(name || firebaseId);
    this.accountsDialogClientFirebaseId.set(firebaseId);
    this.accountsDialogData.set(null);
    this.pullResultByKey.set({});
    this.pullingSourceKey.set(null);
    this.accountsDialogLoading.set(true);
    this.accountsDialogVisible.set(true);
    this.feezbackService.adminGetAccountsAndCards(firebaseId).subscribe({
      next: (data) => {
        this.accountsDialogData.set(data);
        this.accountsDialogLoading.set(false);
      },
      error: (err) => {
        this.accountsDialogLoading.set(false);
        this.accountsDialogVisible.set(false);
        const detail = err?.error?.message ?? err?.message ?? 'טעינת חשבונות וכרטיסים נכשלה';
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

  /**
   * Honors p-dialog's two-way visibility — fires when the user clicks X, presses
   * Esc, or clicks the modal mask. We treat any visible=false as a close request.
   */
  onAccountsDialogVisibleChange(visible: boolean): void {
    if (!visible) this.closeClientAccountsDialog();
  }

  closeClientAccountsDialog(): void {
    this.accountsDialogVisible.set(false);
    this.accountsDialogData.set(null);
    this.pullResultByKey.set({});
    this.pullingSourceKey.set(null);
  }

  /**
   * Pull transactions for one specific account/card of the client whose
   * accounts dialog is open. Reuses the admin pull-source endpoint (which
   * self-heals by running discovery if the source isn't registered yet).
   */
  onPullSource(src: AdminSourceRow): void {
    const firebaseId = this.accountsDialogClientFirebaseId();
    if (!firebaseId || this.pullingSourceKey()) return;
    const key = this.sourceKey(src);
    this.pullingSourceKey.set(key);

    this.feezbackService.adminPullSource(firebaseId, src.type, src.paymentIdentifier)
      .pipe(
        catchError(err => {
          const error = err?.error?.message ?? err?.message ?? 'משיכת התנועות נכשלה';
          this.pullResultByKey.update(m => ({ ...m, [key]: { type: src.type, sourceId: src.paymentIdentifier, status: 'failed', transactionCount: 0, error } }));
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: `${src.paymentIdentifier}: ${error}`, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.pullingSourceKey.set(null)),
      )
      .subscribe(result => {
        this.pullResultByKey.update(m => ({ ...m, [key]: result }));
        if (result.status === 'success') {
          this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: `${src.paymentIdentifier}: נמשכו ${result.transactionCount} תנועות`, life: 4000, key: 'br' });
        } else {
          this.messageService.add({ severity: 'warn', summary: 'משיכה נכשלה', detail: `${src.paymentIdentifier}: ${result.error ?? 'שגיאה לא ידועה'}`, life: 6000, key: 'br' });
        }
      });
  }

  confirmRefreshSources(row: IRowDataTable): void {
    const firebaseId = row['firebaseId'] as string;
    const name = (row['fullName'] as string) || `${row['fName'] || ''} ${row['lName'] || ''}`.trim();
    this.confirmationService.confirm({
      message: `להריץ רענון מקורות (refreshUserSources) עבור "${name}"? תתבצע קריאה ל-Feezback.`,
      header: 'אישור רענון מקורות',
      icon: 'pi pi-refresh',
      acceptLabel: 'רענן',
      rejectLabel: 'ביטול',
      accept: () => this.runRefreshSources(firebaseId, name),
    });
  }

  private runRefreshSources(firebaseId: string, name: string): void {
    if (this.refreshingSourcesFor() === firebaseId) return;
    this.refreshingSourcesFor.set(firebaseId);
    this.refreshingSourcesName.set(name);
    this.feezbackService.adminRefreshUserSources(firebaseId)
      .pipe(
        finalize(() => {
          this.refreshingSourcesFor.set(null);
          this.refreshingSourcesName.set('');
        }),
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? `רענון המקורות של ${name} נכשל`;
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail,
            life: 4000,
            key: 'br',
          });
          return EMPTY;
        }),
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: `מקורות של ${name} רוענו בהצלחה`,
          life: 3000,
          key: 'br',
        });
      });
  }
}

